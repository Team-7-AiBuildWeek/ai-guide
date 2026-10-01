"""Pre-generating the segments people are most likely to ask for, within a hard cap.

Candidates come from two places:
  * demand - (poi, language, persona, depth) combinations that missed or were served
    stale in real tour requests over the last 30 days; these always outrank
  * popularity - the city's top-N POIs in every configured combination

Each candidate is reserved against a fresh `prewarm_run` budget in value order. The
reservation is the database's budget_hard_cap CHECK, so the run cannot exceed the cap;
the worker then tops each paid call up to its worst case within the same budget.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.budget import BudgetExceeded, create_budget
from app.config import DEPTHS, LANGUAGES, PERSONAS, THEMES, Settings
from app.models import Poi, RequestItem, Script, Tour, TourRequest
from app.pipeline import estimate
from app.pipeline.content import current_facts
from app.pipeline.work import (Funding, claim_script, claim_segment, enqueue_audio, enqueue_script,
                               expected_script_hash, planned_segment, translation_source)
from app.providers import Providers
from app.tours.resolve import TourParams, _ready_segment, resolve_tour

DEMAND_WINDOW = timedelta(days=30)
PREMADE = dict(language="en", persona="storyteller", depth_level="full", duration_min=60)
# Until real demand exists, favour the combination most tours use, so a small budget
# covers many POIs once rather than one POI in every variant. Demand overrides this.
DEFAULT_WEIGHT = {"en": 1.0, "storyteller": 1.0, "full": 1.0}


@dataclass(order=True)
class Candidate:
    sort_key: tuple = field(init=False, repr=False)
    value: float
    cost: Decimal
    poi_id: int
    language: str
    persona: str
    depth_level: str
    reason: str

    def __post_init__(self) -> None:
        self.sort_key = (-self.value, self.cost)


@dataclass
class PrewarmReport:
    budget_id: int | None
    cap_usd: Decimal
    reserved_usd: Decimal = Decimal(0)
    queued: list[Candidate] = field(default_factory=list)
    skipped_over_budget: list[Candidate] = field(default_factory=list)
    tours: list[str] = field(default_factory=list)


def demand(session: Session, city_id: int) -> dict[tuple[int, str, str, str], int]:
    since = datetime.now(UTC) - DEMAND_WINDOW
    rows = session.execute(
        select(RequestItem.poi_id, RequestItem.language, RequestItem.persona, RequestItem.depth_level,
               func.count())
        .join(TourRequest, TourRequest.id == RequestItem.tour_request_id)
        .where(TourRequest.city_id == city_id, TourRequest.created_at >= since,
               (RequestItem.was_hit.is_(False)) | (RequestItem.was_stale.is_(True)))
        .group_by(RequestItem.poi_id, RequestItem.language, RequestItem.persona, RequestItem.depth_level)
    ).all()
    return {(r[0], r[1], r[2], r[3]): r[4] for r in rows}


def _missing_cost(session: Session, settings: Settings, providers: Providers, poi: Poi,
                  language: str, persona: str, depth_level: str) -> Decimal | None:
    """Expected cost to make this segment current, or None if it already is."""
    dims = dict(language=language, persona=persona, depth_level=depth_level)
    script = session.scalars(select(Script).where(
        Script.input_hash == expected_script_hash(poi, settings=settings, **dims))).first()
    today = datetime.now(UTC).date()
    if script is not None and script.status == "rejected":
        return None
    if script is not None and script.status == "ready":
        if _ready_segment(session, planned_segment(session, script, settings, providers.tts.name,
                                                   providers.tts.model)[0]):
            return None
        return estimate.audio_cost(session, settings, chars=estimate.tts_chars(depth_level), on=today)
    fact_chars = sum(len(f.content) for f in current_facts(session, poi.id))
    translate = script is not None and translation_source(session, script) is not None
    return estimate.segment_cost(session, settings, depth_level=depth_level, fact_chars=fact_chars,
                                 need_script=True, translate=translate, on=today)


def candidates(session: Session, settings: Settings, providers: Providers, city_id: int, top_n: int) -> list[Candidate]:
    pois = {p.id: p for p in session.scalars(
        select(Poi).where(Poi.city_id == city_id, Poi.is_active, Poi.facts_hash.is_not(None))
        .order_by(Poi.popularity_score.desc(), Poi.id))}
    if not pois:
        return []
    top = list(pois.values())[:top_n]
    max_pop = max((p.popularity_score for p in top), default=0) or 1.0
    values: dict[tuple[int, str, str, str], tuple[float, str]] = {}
    for poi in top:
        for language in LANGUAGES:
            for persona in PERSONAS:
                for depth in DEPTHS:
                    weight = DEFAULT_WEIGHT.get(language, 0.5) * DEFAULT_WEIGHT.get(persona, 0.7) * DEFAULT_WEIGHT.get(depth, 0.8)
                    values[(poi.id, language, persona, depth)] = ((poi.popularity_score / max_pop) * weight, "popular")
    for key, misses in demand(session, city_id).items():
        if key[0] in pois:
            values[key] = (1.0 + misses, f"demand x{misses}")  # observed demand beats any popularity

    out = []
    for (poi_id, language, persona, depth), (value, reason) in values.items():
        cost = _missing_cost(session, settings, providers, pois[poi_id], language, persona, depth)
        if cost is not None:
            out.append(Candidate(value, cost, poi_id, language, persona, depth, reason))
    return sorted(out)


def prewarm(session: Session, settings: Settings, providers: Providers, *, city_id: int,
            budget_usd: Decimal, top_n: int = 25, with_tours: bool = True, dry_run: bool = False) -> PrewarmReport:
    if budget_usd <= 0:
        raise ValueError("budget must be positive")
    if dry_run:
        report = PrewarmReport(budget_id=None, cap_usd=budget_usd)
        for c in candidates(session, settings, providers, city_id, top_n):
            if report.reserved_usd + c.cost <= budget_usd:
                report.reserved_usd += c.cost
                report.queued.append(c)
            else:
                report.skipped_over_budget.append(c)
        return report

    budget = create_budget(session, "prewarm_run", f"prewarm city {city_id} {datetime.now(UTC):%Y-%m-%d %H:%M}", budget_usd)
    funding = Funding(budget.id)
    report = PrewarmReport(budget_id=budget.id, cap_usd=budget_usd)

    if with_tours:  # one ready-made tour per theme, the app's fast path
        for theme in THEMES:
            params = TourParams(city_id=city_id, theme=theme, **PREMADE)
            existing = session.scalars(select(Tour).where(Tour.params_hash == params.hash(settings.script_version))).first()
            if existing is not None and existing.status != "failed":
                continue
            try:
                with session.begin_nested():
                    resolution = resolve_tour(session, params, providers, settings, funding=funding,
                                              is_prewarmed=True, priority=100)
                report.tours.append(f"{theme}: tour {resolution.tour.id}, {resolution.request.segments_total} stops, "
                                    f"${resolution.reserved_usd} reserved")
            except BudgetExceeded:
                report.tours.append(f"{theme}: skipped, over budget")
            except ValueError as exc:
                report.tours.append(f"{theme}: skipped, {exc}")

    today = datetime.now(UTC).date()
    for c in candidates(session, settings, providers, city_id, top_n):
        poi = session.get(Poi, c.poi_id)
        dims = dict(language=c.language, persona=c.persona, depth_level=c.depth_level)
        try:
            with session.begin_nested():
                script = claim_script(session, poi, settings=settings, **dims)
                if script.status == "ready":
                    segment = claim_segment(session, script, settings, providers.tts.name, providers.tts.model)
                    job = enqueue_audio(session, segment, funding, settings, today, priority=50)
                    amount = job.reserved_usd if job else Decimal(0)
                else:
                    amount = enqueue_script(session, script, poi, funding, settings, today, priority=50) or Decimal(0)
        except BudgetExceeded:
            report.skipped_over_budget.append(c)
            continue
        if amount:
            report.queued.append(c)

    session.flush()
    session.refresh(budget)  # reservations are raw UPDATEs; reload the row
    report.reserved_usd = budget.reserved_usd
    return report
