from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import admin, cities, files, tours
from app.config import get_settings
from app.db import session_factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.providers import build_providers
    from app.storage import get_storage

    if not hasattr(app.state, "settings"):  # tests set these up front
        app.state.settings = get_settings()
        app.state.sessions = session_factory()
        app.state.providers = build_providers(app.state.settings)
        app.state.storage = get_storage()
    yield


app = FastAPI(title="walk-backend", version="0.1.0", lifespan=lifespan)
app.include_router(cities.router)
app.include_router(tours.router)
app.include_router(admin.router)
app.include_router(files.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
