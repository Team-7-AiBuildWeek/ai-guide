"""Choosing stops for a city, theme and time budget.

Greedy by popularity: add the next most popular eligible POI while narration + dwell +
planned walking still fits the budget. Interests only ever change *which* POIs are
chosen, never the narration, which is what keeps segments shared across users.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import DEPTHS, THEMES
from app.models import Poi, Script
from app.providers.routing import haversine_m
from app.tours.order import order_stops, path_length

DWELL_S = 30
SPEECH_WORDS_PER_S = 2.4
MAX_STOPS = 15
CANDIDATE_POOL = 60


@dataclass(frozen=True)
class Selection:
    pois: list[Poi]          # in walking order
    planned_seconds: float


def narration_seconds(depth_level: str) -> float:
    return DEPTHS[depth_level].words / SPEECH_WORDS_PER_S


def eligible_pois(session: Session, city_id: int, theme: str, *, exclude_ids: set[int]) -> list[Poi]:
    query = (select(Poi).where(Poi.city_id == city_id, Poi.is_active, Poi.facts_hash.is_not(None))
             .order_by(Poi.popularity_score.desc(), Poi.id).limit(CANDIDATE_POOL * 4))
    tags = THEMES[theme]
    pois = [p for p in session.scalars(query) if p.id not in exclude_ids and (not tags or tags & set(p.tags))]
    return pois[:CANDIDATE_POOL]


def rejected_poi_ids(session: Session, city_id: int, language: str, persona: str, depth_level: str) -> set[int]:
    """POIs whose current script failed fact-checking: leave them out rather than ship them."""
    return set(session.scalars(
        select(Script.poi_id).join(Poi, Poi.id == Script.poi_id).where(
            Poi.city_id == city_id, Script.language == language, Script.persona == persona,
            Script.depth_level == depth_level, Script.status == "rejected",
            Script.facts_hash == Poi.facts_hash)
    ))


def _plan(pois: list[Poi], origin: tuple[float, float] | None) -> tuple[list[Poi], float]:
    """Walking order and planned walking metres. With an origin (where the walker is
    standing), the walk starts from it; the origin itself is not a stop."""
    points = ([origin] if origin else []) + [(p.lat, p.lng) for p in pois]
    order = order_stops(points)
    metres = path_length([points[i] for i in order])
    if origin:
        order = [i - 1 for i in order if i != 0]
    return [pois[i] for i in order], metres


def start_radius_m(target_minutes: int, walking_speed_m_s: float) -> float:
    """How far from the walker a stop may be: a third of the walk's distance, so the
    route has room to come back, within sensible bounds for an old town."""
    return min(3500.0, max(600.0, walking_speed_m_s * target_minutes * 60 / 3))


def select_stops(session: Session, *, city_id: int, theme: str, language: str, persona: str,
                 depth_level: str, target_minutes: int, walking_speed_m_s: float,
                 start_poi_id: int | None = None,
                 origin: tuple[float, float] | None = None) -> Selection:
    candidates = eligible_pois(session, city_id, theme,
                               exclude_ids=rejected_poi_ids(session, city_id, language, persona, depth_level))
    if origin is not None:
        radius = start_radius_m(target_minutes, walking_speed_m_s)
        candidates = [p for p in candidates if haversine_m(origin, (p.lat, p.lng)) <= radius]
    if start_poi_id is not None:
        start = session.get(Poi, start_poi_id)
        if start is None or start.city_id != city_id:
            raise ValueError("start_poi_id is not a POI in this city")
        candidates = [start] + [p for p in candidates if p.id != start_poi_id]
    budget_s = target_minutes * 60
    per_stop = narration_seconds(depth_level) + DWELL_S

    chosen: list[Poi] = []
    planned = 0.0
    for poi in candidates:
        if len(chosen) >= MAX_STOPS:
            break
        trial = chosen + [poi]
        _, metres = _plan(trial, origin)
        total = per_stop * len(trial) + metres / walking_speed_m_s
        if total <= budget_s:
            chosen, planned = trial, total
    if not chosen:
        raise ValueError("no POIs fit this city, theme and time budget")
    ordered, _ = _plan(chosen, origin)
    return Selection(ordered, planned)
