from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.reports import cost_report

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@router.get("/costs")
def costs(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)) -> dict:
    """Spend by day/model, cache-hit ratio, miss cost per request, content cost per tour."""
    return cost_report(db, days=days)
