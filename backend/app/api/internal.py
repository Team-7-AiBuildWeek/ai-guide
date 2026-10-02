"""Running the generation queue on Vercel, where there is no long-lived process.

The web app calls this (through its private service binding) whenever there is
work to move: right after a tour request that missed, while a walker is waiting
for a stop, and once a day from Vercel Cron as a backstop. Each call does one
bounded pass of the worker. Locally, `walk worker` does the same in a loop.
"""

import hmac
import time
from datetime import UTC, datetime

import httpx
from sqlalchemy import text

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.api.deps import get_providers, get_settings
from app.config import Settings
from app.pipeline.worker import Worker

router = APIRouter(prefix="/internal")


def require_worker_secret(settings: Settings = Depends(get_settings),
                          authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {settings.worker_secret}" if settings.worker_secret else None
    if expected is None or authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=403, detail="worker secret required")


@router.post("/worker/tick", dependencies=[Depends(require_worker_secret)])
def tick(request: Request, rounds: int = 3) -> dict:
    """Up to `rounds` worker passes, stopping early when nothing moves or after ~40 s."""
    state = request.app.state
    worker = Worker(state.sessions, get_providers(request), state.storage, state.settings)
    started, totals = time.monotonic(), {}
    for _ in range(max(1, min(rounds, 10))):
        stats = worker.run_once()
        for key, value in stats.items():
            totals[key] = totals.get(key, 0) + value
        if not any(stats.values()) or time.monotonic() - started > 40:
            break
    return totals


@router.get("/health", dependencies=[Depends(require_worker_secret)])
def health(request: Request) -> dict:
    """Is everything this backend depends on actually working? Writes and reads back a
    tiny object in storage, so it proves the credentials, not just their presence."""
    state = request.app.state
    report: dict = {}

    try:
        with state.sessions() as session:
            report["database"] = {
                "ok": True,
                "migration": session.execute(text("SELECT version_num FROM alembic_version")).scalar(),
                "cities": session.execute(text("SELECT count(*) FROM cities")).scalar(),
                "segments_ready": session.execute(text("SELECT count(*) FROM segments WHERE status = 'ready'")).scalar(),
            }
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        report["database"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    key, body = "health/check.txt", f"walk-backend health check {datetime.now(UTC).isoformat()}".encode()
    try:
        state.storage.put(key, body, "text/plain")
        url = state.storage.signed_url(key)
        fetched = httpx.get(url, timeout=10)
        report["storage"] = {"ok": fetched.status_code == 200 and fetched.content == body,
                             "write": True, "signed_read_status": fetched.status_code,
                             "backend": type(state.storage).__name__}
    except Exception as exc:  # noqa: BLE001
        report["storage"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    providers = getattr(state, "providers", None)
    report["generation"] = (
        {"ok": True, "llm": providers.llm.name, "tts": providers.tts.name, "routing": providers.routing.name}
        if providers is not None else {"ok": False, "error": getattr(state, "providers_error", None)}
    )
    report["ok"] = all(part["ok"] for part in report.values() if isinstance(part, dict))
    return report
