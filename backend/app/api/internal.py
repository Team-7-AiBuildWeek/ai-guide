"""Running the generation queue on Vercel, where there is no long-lived process.

The web app calls this (through its private service binding) whenever there is
work to move: right after a tour request that missed, while a walker is waiting
for a stop, and once a day from Vercel Cron as a backstop. Each call does one
bounded pass of the worker. Locally, `walk worker` does the same in a loop.
"""

import hmac
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.api.deps import get_settings
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
    worker = Worker(state.sessions, state.providers, state.storage, state.settings)
    started, totals = time.monotonic(), {}
    for _ in range(max(1, min(rounds, 10))):
        stats = worker.run_once()
        for key, value in stats.items():
            totals[key] = totals.get(key, 0) + value
        if not any(stats.values()) or time.monotonic() - started > 40:
            break
    return totals
