"""Claiming work. Every claim is an INSERT ... ON CONFLICT DO NOTHING against a unique
index, so two requests racing for the same missing segment produce one row and one job:
the database, not the application, decides who pays."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.budget import reserve
from app.config import LANGUAGES, Settings
from app.hashing import audio_hash, script_hash
from app.models import Job, Poi, Script, Segment
from app.pipeline import estimate
from app.pipeline.content import current_facts, lexicon_for
from app.providers.tts import TTSInput, TTSProvider

LIVE_JOB = text("status IN ('queued', 'running', 'submitted')")


@dataclass(frozen=True)
class Funding:
    """Which budgets pay for new work. On-demand work also draws on the daily cap."""
    budget_id: int
    daily_budget_id: int | None = None

    @property
    def budget_ids(self) -> list[int]:
        return [b for b in (self.budget_id, self.daily_budget_id) if b is not None]


def expected_script_hash(poi: Poi, language: str, persona: str, depth_level: str, settings: Settings) -> str:
    if poi.facts_hash is None:
        raise ValueError(f"poi {poi.id} has no facts; seed it before narrating it")
    return script_hash(poi_id=poi.id, language=language, persona=persona, depth_level=depth_level,
                       script_version=settings.script_version, facts_hash=poi.facts_hash)


def claim_script(session: Session, poi: Poi, language: str, persona: str, depth_level: str,
                 settings: Settings) -> Script:
    input_hash = expected_script_hash(poi, language, persona, depth_level, settings)
    session.execute(
        insert(Script).values(
            poi_id=poi.id, language=language, persona=persona, depth_level=depth_level,
            script_version=settings.script_version, facts_hash=poi.facts_hash, input_hash=input_hash,
        ).on_conflict_do_nothing(index_elements=["input_hash"])
    )
    return session.scalars(select(Script).where(Script.input_hash == input_hash)).one()


def translation_source(session: Session, script: Script) -> Script | None:
    """A ready English script on the same facts can be translated by the cheap model
    instead of drafted and fact-checked again."""
    if script.language == "en":
        return None
    return session.scalars(select(Script).where(
        Script.poi_id == script.poi_id, Script.language == "en", Script.persona == script.persona,
        Script.depth_level == script.depth_level, Script.script_version == script.script_version,
        Script.facts_hash == script.facts_hash, Script.status == "ready",
    )).first()


def _insert_job(session: Session, job_type: str, dedupe_key: str, payload: dict, funding: Funding,
                priority: int) -> Job | None:
    row = session.execute(
        insert(Job).values(
            job_type=job_type, dedupe_key=dedupe_key, payload=payload, priority=priority,
            budget_id=funding.budget_id, daily_budget_id=funding.daily_budget_id,
        ).on_conflict_do_nothing(index_elements=["dedupe_key"], index_where=LIVE_JOB)
        .returning(Job.id)
    ).first()
    return session.get(Job, row[0]) if row else None


def enqueue_script(session: Session, script: Script, poi: Poi, funding: Funding, settings: Settings,
                   tts: TTSProvider, on: date, priority: int = 0) -> Decimal | None:
    """Queue generation of a script and the audio after it. Reserves the expected cost of
    the whole chain up front. Returns the amount reserved, or None if the work is
    already queued (whoever queued it first pays). Raises BudgetExceeded."""
    if script.status in ("ready", "rejected"):
        return None
    source = translation_source(session, script)
    payload = {"script_id": script.id, "stage": "translate" if source else "draft"}
    if source:
        payload["source_script_id"] = source.id
    job = _insert_job(session, "script", f"script:{script.input_hash}", payload, funding, priority)
    if job is None:
        return None
    fact_chars = sum(len(f.content) for f in current_facts(session, poi.id))
    amount = estimate.segment_cost(session, settings, tts, depth_level=script.depth_level, fact_chars=fact_chars,
                                   need_script=True, translate=source is not None, on=on)
    reserve(session, funding.budget_ids, amount)
    job.reserved_usd = amount
    return amount


def planned_segment(session: Session, script: Script, settings: Settings,
                    tts: TTSProvider) -> tuple[str, TTSInput]:
    """The audio hash a ready script should have under the current voice and lexicon."""
    locale = LANGUAGES[script.language]
    tts_input = tts.prepare(script.script_text, locale, lexicon_for(session, locale))
    input_hash = audio_hash(script_input_hash=script.input_hash, script_text=script.script_text,
                            tts_provider=tts.name, tts_model=tts.model,
                            voice_id=tts.voice_for(script.language, settings.voice_name),
                            lexicon_hash=tts_input.lexicon_hash)
    return input_hash, tts_input


def claim_segment(session: Session, script: Script, settings: Settings, tts: TTSProvider) -> Segment:
    input_hash, tts_input = planned_segment(session, script, settings, tts)
    session.execute(
        insert(Segment).values(
            script_id=script.id, poi_id=script.poi_id, language=script.language, persona=script.persona,
            depth_level=script.depth_level, tts_provider=tts.name, tts_model=tts.model,
            voice_id=tts.voice_for(script.language, settings.voice_name), lexicon_hash=tts_input.lexicon_hash,
            ssml=tts_input.document, input_hash=input_hash,
        ).on_conflict_do_nothing(index_elements=["input_hash"])
    )
    return session.scalars(select(Segment).where(Segment.input_hash == input_hash)).one()


def enqueue_audio(session: Session, segment: Segment, funding: Funding, settings: Settings, tts: TTSProvider,
                  on: date, priority: int = 0, reserved: Decimal | None = None) -> Job | None:
    """Queue TTS for a segment. `reserved` hands over a reservation already held (from
    the script job); otherwise the expected cost is reserved here."""
    if segment.status == "ready":
        return None
    job = _insert_job(session, "audio", f"audio:{segment.input_hash}", {"segment_id": segment.id}, funding, priority)
    if job is None:
        return None
    if reserved is None:
        reserved = estimate.audio_cost(session, tts, depth_level=segment.depth_level, on=on)
        reserve(session, funding.budget_ids, reserved)
    job.reserved_usd = reserved
    return job
