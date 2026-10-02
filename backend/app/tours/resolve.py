"""Turning a tour request into a tour, paying only for what is missing.

  1. select and order POIs for the city / theme / time budget
  2. for each stop, look for a ready segment:
       exact hit  - same script hash and audio hash as we would generate today: free
       stale hit  - an older rendering of the same (poi, language, persona, depth):
                    served as-is, picked up for regeneration by `walk prewarm`
       miss       - claim the script/segment and queue it, reserving its expected cost
  3. walking legs, from cache or the routing provider
  4. record the request and every stop's outcome, for hit ratios and prewarm demand

All of it runs in the caller's transaction, so a budget refusal rolls back the lot.
"""

from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.budget import create_budget, daily_budget
from app.config import DEPTHS, LANGUAGES, PERSONAS, THEMES, Settings
from app.hashing import stable_hash
from app.models import Poi, RequestItem, Script, Segment, Tour, TourRequest, TourStop, WalkingLeg
from app.pipeline.work import (Funding, claim_script, claim_segment, enqueue_audio, enqueue_script,
                               expected_script_hash, planned_segment)
from app.providers import Providers
from app.providers.routing import decode_polyline
from app.tours.select import select_stops
from app.pipeline.worker import finalize_tours


@dataclass(frozen=True)
class TourParams:
    city_id: int
    theme: str = "highlights"
    language: str = "en"
    persona: str = "storyteller"
    depth_level: str = "full"
    duration_min: int = 60
    start_poi_id: int | None = None
    # Where the walker is standing. Rounded to ~100 m so neighbours share a tour.
    start_lat: float | None = None
    start_lng: float | None = None

    def __post_init__(self) -> None:
        if self.start_lat is not None and self.start_lng is not None:
            object.__setattr__(self, "start_lat", round(self.start_lat, 3))
            object.__setattr__(self, "start_lng", round(self.start_lng, 3))
        elif self.start_lat is not None or self.start_lng is not None:
            raise ValueError("start_lat and start_lng go together")

    @property
    def origin(self) -> tuple[float, float] | None:
        return (self.start_lat, self.start_lng) if self.start_lat is not None else None

    def validate(self) -> None:
        for value, allowed, name in ((self.theme, THEMES, "theme"), (self.language, LANGUAGES, "language"),
                                     (self.persona, PERSONAS, "persona"), (self.depth_level, DEPTHS, "depth_level")):
            if value not in allowed:
                raise ValueError(f"{name} must be one of {sorted(allowed)}")
        if not 10 <= self.duration_min <= 240:
            raise ValueError("duration_min must be between 10 and 240")

    def hash(self, script_version: int) -> str:
        return stable_hash({**asdict(self), "script_version": script_version})


@dataclass
class Resolution:
    tour: Tour
    request: TourRequest
    reserved_usd: Decimal
    reused_tour: bool

    @property
    def hit_ratio(self) -> float:
        total = self.request.segments_total
        return self.request.segments_hit / total if total else 1.0


def _today() -> date:
    return datetime.now(UTC).date()


def on_demand_funding(session: Session, settings: Settings, label: str) -> Funding:
    request_budget = create_budget(session, "tour_request", label, settings.request_budget_usd)
    daily = daily_budget(session, _today(), settings.daily_budget_usd)
    return Funding(request_budget.id, daily.id)


def _ready_segment(session: Session, input_hash: str) -> Segment | None:
    return session.scalars(select(Segment).where(Segment.input_hash == input_hash, Segment.status == "ready")).first()


def latest_ready_segment(session: Session, poi_id: int, language: str, persona: str, depth_level: str) -> Segment | None:
    return session.scalars(select(Segment).where(
        Segment.poi_id == poi_id, Segment.language == language, Segment.persona == persona,
        Segment.depth_level == depth_level, Segment.status == "ready",
    ).order_by(Segment.id.desc())).first()


def walking_leg(session: Session, providers: Providers, a: Poi, b: Poi, language: str) -> WalkingLeg:
    provider = providers.routing.name
    cached = session.scalars(select(WalkingLeg).where(
        WalkingLeg.from_poi_id == a.id, WalkingLeg.to_poi_id == b.id,
        WalkingLeg.provider == provider, WalkingLeg.language == language)).first()
    if cached:
        return cached
    leg = providers.routing.walk((a.lat, a.lng), (b.lat, b.lng), language)
    session.execute(insert(WalkingLeg).values(
        from_poi_id=a.id, to_poi_id=b.id, provider=provider, language=language, distance_m=leg.distance_m,
        duration_s=leg.duration_s, polyline=leg.polyline, instructions=leg.instructions,
    ).on_conflict_do_nothing())
    return session.scalars(select(WalkingLeg).where(
        WalkingLeg.from_poi_id == a.id, WalkingLeg.to_poi_id == b.id,
        WalkingLeg.provider == provider, WalkingLeg.language == language)).one()


def resolve_tour(session: Session, params: TourParams, providers: Providers, settings: Settings, *,
                 funding: Funding | None = None, is_prewarmed: bool = False, priority: int = 0) -> Resolution:
    params.validate()
    params_hash = params.hash(settings.script_version)
    tour = session.scalars(select(Tour).where(Tour.params_hash == params_hash)).first()
    if tour is not None and tour.status != "failed":
        return _reuse(session, tour, params)

    funding = funding or on_demand_funding(session, settings, f"tour request {params_hash[:12]}")
    selection = select_stops(session, city_id=params.city_id, theme=params.theme, language=params.language,
                             persona=params.persona, depth_level=params.depth_level,
                             target_minutes=params.duration_min, walking_speed_m_s=settings.walking_speed_m_s,
                             start_poi_id=params.start_poi_id, origin=params.origin)
    if tour is None:
        tour = Tour(city_id=params.city_id, params_hash=params_hash, theme=params.theme, language=params.language,
                    persona=params.persona, depth_level=params.depth_level,
                    target_duration_min=params.duration_min, is_prewarmed=is_prewarmed)
        session.add(tour)
    else:  # a failed tour is rebuilt in place
        session.query(TourStop).filter_by(tour_id=tour.id).delete()
        tour.status = "pending"
    tour.start_poi_id = selection.pois[0].id
    session.flush()

    request = TourRequest(city_id=params.city_id, params=asdict(params), tour_id=tour.id, budget_id=funding.budget_id)
    session.add(request)
    session.flush()

    reserved = Decimal(0)
    hits = 0
    tts = providers.tts
    on = _today()
    legs: list[WalkingLeg | None] = [walking_leg(session, providers, a, b, params.language)
                                     for a, b in zip(selection.pois, selection.pois[1:])] + [None]
    for position, (poi, leg) in enumerate(zip(selection.pois, legs)):
        dims = dict(language=params.language, persona=params.persona, depth_level=params.depth_level)
        script = session.scalars(select(Script).where(
            Script.input_hash == expected_script_hash(poi, settings=settings, **dims))).first()
        segment, stale = None, False
        if script is not None and script.status == "ready":
            segment = _ready_segment(session, planned_segment(session, script, settings, tts)[0])
        if segment is None:
            segment = latest_ready_segment(session, poi.id, **dims)
            stale = segment is not None
        if segment is None:  # miss: claim it and pay for it
            script = claim_script(session, poi, settings=settings, **dims)
            if script.status == "ready":
                new_segment = claim_segment(session, script, settings, tts)
                job = enqueue_audio(session, new_segment, funding, settings, tts, on, priority=priority)
                reserved += job.reserved_usd if job else Decimal(0)
            else:
                reserved += enqueue_script(session, script, poi, funding, settings, tts, on,
                                           priority=priority) or Decimal(0)
        hits += segment is not None
        session.add(TourStop(tour_id=tour.id, position=position, poi_id=poi.id,
                             script_id=segment.script_id if segment else script.id,
                             segment_id=segment.id if segment else None,
                             leg_to_next_id=leg.id if leg else None))
        session.add(RequestItem(tour_request_id=request.id, position=position, poi_id=poi.id,
                                script_id=segment.script_id if segment else script.id,
                                segment_id=segment.id if segment else None,
                                was_hit=segment is not None, was_stale=stale, **dims))

    tour.total_walk_m = sum(leg.distance_m for leg in legs if leg)
    tour.route_geojson = {
        "type": "LineString",
        "coordinates": [[lng, lat] for leg in legs if leg for lat, lng in decode_polyline(leg.polyline)],
    }
    request.segments_total, request.segments_hit = len(selection.pois), hits
    session.flush()
    finalize_tours(session)
    session.refresh(tour)
    return Resolution(tour=tour, request=request, reserved_usd=reserved, reused_tour=False)


def _reuse(session: Session, tour: Tour, params: TourParams) -> Resolution:
    stops = session.scalars(select(TourStop).where(TourStop.tour_id == tour.id).order_by(TourStop.position)).all()
    request = TourRequest(city_id=params.city_id, params=asdict(params), tour_id=tour.id,
                          segments_total=len(stops), segments_hit=sum(s.segment_id is not None for s in stops))
    session.add(request)
    session.flush()
    for stop in stops:
        session.add(RequestItem(tour_request_id=request.id, position=stop.position, poi_id=stop.poi_id,
                                language=tour.language, persona=tour.persona, depth_level=tour.depth_level,
                                script_id=stop.script_id, segment_id=stop.segment_id,
                                was_hit=stop.segment_id is not None))
    session.flush()
    return Resolution(tour=tour, request=request, reserved_usd=Decimal(0), reused_tour=True)
