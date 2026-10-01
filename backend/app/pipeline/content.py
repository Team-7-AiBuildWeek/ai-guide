"""Reading the grounding material and the lexicon."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.hashing import facts_hash
from app.models import LexiconEntry, Poi, PoiFact
from app.ssml import Pronunciation


def current_facts(session: Session, poi_id: int) -> list[PoiFact]:
    return list(session.scalars(
        select(PoiFact).where(PoiFact.poi_id == poi_id, PoiFact.superseded_at.is_(None)).order_by(PoiFact.id)
    ))


def refresh_facts_hash(session: Session, poi: Poi) -> str | None:
    """Recompute after facts change. A new hash makes every script built on the old facts
    stale: still served, but queued for regeneration by prewarm."""
    facts = current_facts(session, poi.id)
    poi.facts_hash = facts_hash(f.content_hash for f in facts) if facts else None
    poi.updated_at = func.now()
    session.flush()
    return poi.facts_hash


def lexicon_for(session: Session, locale: str) -> list[Pronunciation]:
    return [
        Pronunciation(e.surface_form, e.alphabet, e.phoneme)
        for e in session.scalars(select(LexiconEntry).where(LexiconEntry.locale == locale))
    ]
