"""Serves audio for STORAGE_BACKEND=local, so a browser can play it during development.
Production audio comes straight from R2 via presigned URLs and never touches this."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app.storage import LocalStorage

router = APIRouter()


@router.get("/files/{key:path}")
def local_file(key: str, expires: int, sig: str, request: Request) -> FileResponse:
    storage = request.app.state.storage
    if not isinstance(storage, LocalStorage):
        raise HTTPException(404)
    path = storage.open_signed(key, expires, sig)
    if path is None:
        raise HTTPException(403, "link expired or invalid")
    return FileResponse(path, media_type="audio/mpeg", headers={"cache-control": "private, max-age=3600"})
