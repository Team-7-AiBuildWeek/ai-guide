"""Price lookup from model_prices. Costs are Decimal, rounded to micro-dollars."""

from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ModelPrice

MICRO = Decimal("0.000001")
MILLION = Decimal(1_000_000)


class PriceMissing(LookupError):
    """No price row covers this call. Refuse to spend rather than spend unrecorded."""


def unit_price_per_million(session: Session, provider: str, model: str, tier: str,
                           unit_type: str, on: date) -> Decimal:
    row = session.scalars(
        select(ModelPrice).where(
            ModelPrice.provider == provider, ModelPrice.model == model, ModelPrice.tier == tier,
            ModelPrice.unit_type == unit_type, ModelPrice.effective_from <= on,
            (ModelPrice.effective_to.is_(None)) | (ModelPrice.effective_to > on),
        )
    ).first()
    if row is None:
        raise PriceMissing(f"no price for {provider}/{model}/{tier}/{unit_type} on {on}")
    return row.usd_per_million


def cost(session: Session, provider: str, model: str, tier: str, units: dict[str, int],
         on: date, *, round_up: bool = False) -> Decimal:
    """Cost of `units` ({unit_type: count}). round_up=True for reservations."""
    total = Decimal(0)
    for unit_type, count in units.items():
        if count:
            total += unit_price_per_million(session, provider, model, tier, unit_type, on) * Decimal(count) / MILLION
    return total.quantize(MICRO, rounding=ROUND_CEILING if round_up else ROUND_HALF_UP)
