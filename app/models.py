"""ORM mapping of migrations/sql/0001_init.sql.

The SQL file is the source of truth for constraints and defaults; these classes only
mirror the columns so queries read naturally. Server defaults are left to Postgres.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ARRAY, BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONB, list[Any]: JSONB, int: BigInteger}


def _id() -> Mapped[int]:
    return mapped_column(BigInteger, primary_key=True)


class City(Base):
    __tablename__ = "cities"
    id: Mapped[int] = _id()
    slug: Mapped[str]
    name: Mapped[str]
    country_code: Mapped[str]
    local_language: Mapped[str]
    min_lat: Mapped[float]
    min_lng: Mapped[float]
    max_lat: Mapped[float]
    max_lng: Mapped[float]
    centroid_lat: Mapped[float]
    centroid_lng: Mapped[float]
    status: Mapped[str] = mapped_column(server_default="draft")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")


class Poi(Base):
    __tablename__ = "pois"
    id: Mapped[int] = _id()
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    name: Mapped[str]
    local_name: Mapped[str | None]
    lat: Mapped[float]
    lng: Mapped[float]
    trigger_radius_m: Mapped[int] = mapped_column(server_default="40")
    wikidata_qid: Mapped[str | None]
    overture_id: Mapped[str | None]
    category: Mapped[str | None]
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    popularity_score: Mapped[float] = mapped_column(server_default="0")
    facts_hash: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()")


class PoiFact(Base):
    __tablename__ = "poi_facts"
    id: Mapped[int] = _id()
    poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    source_type: Mapped[str]
    source_url: Mapped[str]
    source_revision: Mapped[str | None]
    license: Mapped[str]
    language: Mapped[str]
    content: Mapped[str]
    content_hash: Mapped[str]
    retrieved_at: Mapped[datetime] = mapped_column(server_default="now()")
    superseded_at: Mapped[datetime | None]


class Script(Base):
    __tablename__ = "scripts"
    id: Mapped[int] = _id()
    poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    language: Mapped[str]
    persona: Mapped[str]
    depth_level: Mapped[str]
    script_version: Mapped[int]
    facts_hash: Mapped[str]
    input_hash: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="pending")
    script_text: Mapped[str | None]
    word_count: Mapped[int | None]
    llm_model: Mapped[str | None]
    fact_check: Mapped[dict[str, Any] | None]
    qa_status: Mapped[str] = mapped_column(server_default="unchecked")
    draft_attempts: Mapped[int] = mapped_column(server_default="0")
    translated_from_script_id: Mapped[int | None] = mapped_column(ForeignKey("scripts.id"))
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()")


class ScriptSource(Base):
    __tablename__ = "script_sources"
    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id"), primary_key=True)
    poi_fact_id: Mapped[int] = mapped_column(ForeignKey("poi_facts.id"), primary_key=True)


class Segment(Base):
    __tablename__ = "segments"
    id: Mapped[int] = _id()
    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id"))
    poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    language: Mapped[str]
    persona: Mapped[str]
    depth_level: Mapped[str]
    tts_provider: Mapped[str]
    tts_model: Mapped[str]
    voice_id: Mapped[str]
    lexicon_hash: Mapped[str]
    ssml: Mapped[str]
    input_hash: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="pending")
    audio_key: Mapped[str | None]
    audio_bytes: Mapped[int | None]
    duration_ms: Mapped[int | None]
    billed_chars: Mapped[int | None]
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()")


class WalkingLeg(Base):
    __tablename__ = "walking_legs"
    id: Mapped[int] = _id()
    from_poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    to_poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    provider: Mapped[str]
    language: Mapped[str]
    distance_m: Mapped[int]
    duration_s: Mapped[int]
    polyline: Mapped[str]
    instructions: Mapped[list[Any]] = mapped_column(server_default="[]")
    retrieved_at: Mapped[datetime] = mapped_column(server_default="now()")


class Tour(Base):
    __tablename__ = "tours"
    id: Mapped[int] = _id()
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    params_hash: Mapped[str]
    theme: Mapped[str]
    language: Mapped[str]
    persona: Mapped[str]
    depth_level: Mapped[str]
    target_duration_min: Mapped[int]
    start_poi_id: Mapped[int | None] = mapped_column(ForeignKey("pois.id"))
    status: Mapped[str] = mapped_column(server_default="pending")
    route_geojson: Mapped[dict[str, Any] | None]
    total_walk_m: Mapped[int | None]
    total_duration_ms: Mapped[int | None]
    is_prewarmed: Mapped[bool] = mapped_column(server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()")


class TourStop(Base):
    __tablename__ = "tour_stops"
    tour_id: Mapped[int] = mapped_column(ForeignKey("tours.id"), primary_key=True)
    position: Mapped[int] = mapped_column(primary_key=True)
    poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    script_id: Mapped[int] = mapped_column(ForeignKey("scripts.id"))
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"))
    leg_to_next_id: Mapped[int | None] = mapped_column(ForeignKey("walking_legs.id"))


class ModelPrice(Base):
    __tablename__ = "model_prices"
    id: Mapped[int] = _id()
    provider: Mapped[str]
    model: Mapped[str]
    tier: Mapped[str]
    unit_type: Mapped[str]
    usd_per_million: Mapped[Decimal]
    effective_from: Mapped[date]
    effective_to: Mapped[date | None]
    source_url: Mapped[str]


class Budget(Base):
    __tablename__ = "budgets"
    id: Mapped[int] = _id()
    scope: Mapped[str]
    label: Mapped[str]
    day: Mapped[date | None]
    cap_usd: Mapped[Decimal]
    reserved_usd: Mapped[Decimal] = mapped_column(server_default="0")
    spent_usd: Mapped[Decimal] = mapped_column(server_default="0")
    overrun_usd: Mapped[Decimal] = mapped_column(server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")


class TourRequest(Base):
    __tablename__ = "tour_requests"
    id: Mapped[int] = _id()
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    params: Mapped[dict[str, Any]]
    tour_id: Mapped[int | None] = mapped_column(ForeignKey("tours.id"))
    budget_id: Mapped[int | None] = mapped_column(ForeignKey("budgets.id"))
    segments_total: Mapped[int] = mapped_column(server_default="0")
    segments_hit: Mapped[int] = mapped_column(server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")


class RequestItem(Base):
    __tablename__ = "request_items"
    tour_request_id: Mapped[int] = mapped_column(ForeignKey("tour_requests.id"), primary_key=True)
    position: Mapped[int] = mapped_column(primary_key=True)
    poi_id: Mapped[int] = mapped_column(ForeignKey("pois.id"))
    language: Mapped[str]
    persona: Mapped[str]
    depth_level: Mapped[str]
    script_id: Mapped[int | None] = mapped_column(ForeignKey("scripts.id"))
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"))
    was_hit: Mapped[bool]
    was_stale: Mapped[bool] = mapped_column(server_default="false")


class LexiconEntry(Base):
    __tablename__ = "pronunciation_lexicon"
    id: Mapped[int] = _id()
    locale: Mapped[str]
    surface_form: Mapped[str]
    alphabet: Mapped[str]
    phoneme: Mapped[str]
    poi_id: Mapped[int | None] = mapped_column(ForeignKey("pois.id"))
    notes: Mapped[str | None]
    verified_by: Mapped[str | None]
    updated_at: Mapped[datetime] = mapped_column(server_default="now()")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = _id()
    job_type: Mapped[str]
    payload: Mapped[dict[str, Any]]
    dedupe_key: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="queued")
    priority: Mapped[int] = mapped_column(server_default="0")
    attempts: Mapped[int] = mapped_column(server_default="0")
    max_attempts: Mapped[int] = mapped_column(server_default="3")
    run_after: Mapped[datetime] = mapped_column(server_default="now()")
    locked_by: Mapped[str | None]
    locked_at: Mapped[datetime | None]
    external_batch_id: Mapped[str | None]
    budget_id: Mapped[int | None] = mapped_column(ForeignKey("budgets.id"))
    daily_budget_id: Mapped[int | None] = mapped_column(ForeignKey("budgets.id"))
    reserved_usd: Mapped[Decimal] = mapped_column(server_default="0")
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]


class CostLedger(Base):
    __tablename__ = "cost_ledger"
    id: Mapped[int] = _id()
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"))
    budget_id: Mapped[int | None] = mapped_column(ForeignKey("budgets.id"))
    provider: Mapped[str]
    model: Mapped[str]
    tier: Mapped[str]
    operation: Mapped[str]
    units: Mapped[dict[str, Any]]
    cost_usd: Mapped[Decimal]
    script_id: Mapped[int | None] = mapped_column(ForeignKey("scripts.id"))
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"))
    external_request_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
