from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import DEPTHS, LANGUAGES, PERSONAS, THEMES
from app.models import City, Tour, TourStop

router = APIRouter()


@router.get("/meta")
def meta() -> dict:
    """What this backend can narrate, so clients do not hardcode it."""
    return {"languages": sorted(LANGUAGES), "personas": sorted(PERSONAS), "depths": sorted(DEPTHS),
            "themes": sorted(THEMES), "duration_min": {"min": 10, "max": 240}}


@router.get("/cities")
def list_cities(db: Session = Depends(get_db)) -> list[dict]:
    cities = db.scalars(select(City).where(City.status == "active").order_by(City.name))
    return [{"id": c.id, "slug": c.slug, "name": c.name, "country_code": c.country_code,
             "centroid": {"lat": c.centroid_lat, "lng": c.centroid_lng},
             "bbox": [c.min_lng, c.min_lat, c.max_lng, c.max_lat]} for c in cities]


@router.get("/cities/{city_id}/tours")
def premade_tours(city_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """Pre-made, fully generated tours: the fast path, no generation, no wait."""
    if db.get(City, city_id) is None:
        raise HTTPException(404, "city not found")
    stops = select(TourStop.tour_id, func.count().label("n")).group_by(TourStop.tour_id).subquery()
    rows = db.execute(
        select(Tour, stops.c.n).join(stops, stops.c.tour_id == Tour.id)
        .where(Tour.city_id == city_id, Tour.status == "ready", Tour.is_prewarmed)
        .order_by(Tour.theme, Tour.language)
    ).all()
    return [{"id": t.id, "theme": t.theme, "language": t.language, "persona": t.persona,
             "depth_level": t.depth_level, "target_duration_min": t.target_duration_min,
             "stops": n, "total_duration_ms": t.total_duration_ms, "total_walk_m": t.total_walk_m}
            for t, n in rows]
