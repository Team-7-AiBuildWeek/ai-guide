"""Storing grounding facts. Facts are append-only: a changed source supersedes the old
row, so scripts keep pointing at exactly what they were written from, and the POI's
facts_hash changes, which marks its narration stale."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.hashing import content_hash
from app.models import PoiFact


def upsert_fact(session: Session, poi_id: int, *, source_type: str, source_url: str, license: str,
                language: str, content: str, source_revision: str | None = None) -> bool:
    """Returns True if the stored facts changed."""
    digest = content_hash(content)
    current = session.scalars(select(PoiFact).where(
        PoiFact.poi_id == poi_id, PoiFact.source_url == source_url, PoiFact.superseded_at.is_(None))).first()
    if current is not None and current.content_hash == digest:
        return False
    if current is not None:
        current.superseded_at = func.now()
        session.flush()
    session.add(PoiFact(poi_id=poi_id, source_type=source_type, source_url=source_url, license=license,
                        language=language, content=content, content_hash=digest, source_revision=source_revision))
    session.flush()
    return True
