from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_settings
from app.budget import BudgetExceeded
from app.config import Settings
from app.models import City, Poi, PoiFact, Script, ScriptSource, Segment, Tour, TourStop, WalkingLeg
from app.tours.resolve import TourParams, resolve_tour

router = APIRouter()
MANIFEST_VERSION = 1


class TourRequestBody(BaseModel):
    city_id: int
    theme: str = "highlights"
    language: str = "en"
    persona: str = "storyteller"
    depth_level: str = "full"
    duration_min: int = Field(60, ge=10, le=240)
    start_poi_id: int | None = None


@router.post("/tours")
def request_tour(body: TourRequestBody, request: Request, response: Response,
                 db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    """Returns an existing tour, or builds one from cached segments and queues only the
    missing ones. 200 when the tour is ready to download, 202 while audio is generating."""
    city = db.get(City, body.city_id)
    if city is None or city.status != "active":
        raise HTTPException(404, "city not found")
    params = TourParams(**body.model_dump())
    try:
        params.validate()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        resolution = resolve_tour(db, params, request.app.state.providers, settings)
    except BudgetExceeded as exc:
        db.rollback()
        raise HTTPException(429, "Custom tour generation is at its spending limit right now. "
                                 "Pick a ready-made tour, or try again later.") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    tour = resolution.tour
    response.status_code = 200 if tour.status == "ready" else 202
    return {
        "tour_id": tour.id,
        "status": tour.status,
        "cache": {"segments_total": resolution.request.segments_total,
                  "segments_hit": resolution.request.segments_hit,
                  "hit_ratio": round(resolution.hit_ratio, 4)},
        "bundle_url": f"/tours/{tour.id}/bundle",
    }


def _stops(db: Session, tour_id: int):
    return db.execute(
        select(TourStop, Poi, Segment, Script, WalkingLeg)
        .join(Poi, Poi.id == TourStop.poi_id)
        .join(Script, Script.id == TourStop.script_id)
        .outerjoin(Segment, Segment.id == TourStop.segment_id)
        .outerjoin(WalkingLeg, WalkingLeg.id == TourStop.leg_to_next_id)
        .where(TourStop.tour_id == tour_id).order_by(TourStop.position)
    ).all()


@router.get("/tours/{tour_id}")
def get_tour(tour_id: int, db: Session = Depends(get_db)) -> dict:
    tour = db.get(Tour, tour_id)
    if tour is None:
        raise HTTPException(404, "tour not found")
    return {
        "id": tour.id, "city_id": tour.city_id, "status": tour.status, "theme": tour.theme,
        "language": tour.language, "persona": tour.persona, "depth_level": tour.depth_level,
        "target_duration_min": tour.target_duration_min, "total_duration_ms": tour.total_duration_ms,
        "total_walk_m": tour.total_walk_m, "is_prewarmed": tour.is_prewarmed,
        "stops": [{"position": stop.position, "poi_id": poi.id, "name": poi.name, "lat": poi.lat, "lng": poi.lng,
                   "audio_ready": segment is not None, "script_status": script.status}
                  for stop, poi, segment, script, _ in _stops(db, tour_id)],
    }


@router.get("/tours/{tour_id}/bundle")
def bundle(tour_id: int, request: Request, db: Session = Depends(get_db),
           settings: Settings = Depends(get_settings)) -> dict:
    """Everything the app needs to run the tour offline: download once, then no network.
    Audio URLs are signed and expire; the app must fetch the MP3s right away."""
    tour = db.get(Tour, tour_id)
    if tour is None:
        raise HTTPException(404, "tour not found")
    if tour.status != "ready":
        raise HTTPException(409, f"tour is {tour.status}; poll GET /tours/{tour_id} until it is ready")
    storage = request.app.state.storage
    rows = _stops(db, tour_id)
    sources = _sources(db, [script.id for _, _, _, script, _ in rows])
    expires = datetime.now(UTC) + timedelta(seconds=settings.signed_url_ttl_s)
    return {
        "manifest_version": MANIFEST_VERSION,
        "tour": {"id": tour.id, "city_id": tour.city_id, "theme": tour.theme, "language": tour.language,
                 "persona": tour.persona, "depth_level": tour.depth_level,
                 "total_duration_ms": tour.total_duration_ms, "total_walk_m": tour.total_walk_m,
                 "route": tour.route_geojson},
        "audio_urls_expire_at": expires.isoformat(),
        "stops": [{
            "position": stop.position,
            "poi_id": poi.id,
            "name": poi.name,
            "local_name": poi.local_name,
            "lat": poi.lat,
            "lng": poi.lng,
            "trigger_radius_m": poi.trigger_radius_m,
            "audio": {"url": storage.signed_url(segment.audio_key), "duration_ms": segment.duration_ms,
                      "bytes": segment.audio_bytes, "content_type": "audio/mpeg", "id": segment.input_hash},
            "transcript": script.script_text,
            "sources": sources.get(script.id, []),
            "walk_to_next": None if leg is None else {
                "distance_m": leg.distance_m, "duration_s": leg.duration_s,
                "polyline": leg.polyline, "polyline_precision": 5, "instructions": leg.instructions},
        } for stop, poi, segment, script, leg in rows],
    }


def _sources(db: Session, script_ids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    rows = db.execute(
        select(ScriptSource.script_id, PoiFact.source_url, PoiFact.license)
        .join(PoiFact, PoiFact.id == ScriptSource.poi_fact_id).where(ScriptSource.script_id.in_(script_ids))
    ).all()
    for script_id, url, license_ in rows:
        out.setdefault(script_id, []).append({"url": url, "license": license_})
    return out
