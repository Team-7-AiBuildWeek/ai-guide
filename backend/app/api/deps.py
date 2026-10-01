"""Request-scoped dependencies. Providers and storage are built once at startup and
can be swapped in tests via app.state."""

from collections.abc import Iterator

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import Settings


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.sessions()
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def require_admin(settings: Settings = Depends(get_settings),
                  x_admin_token: str | None = Header(default=None)) -> None:
    if not settings.admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=403, detail="admin token required")
