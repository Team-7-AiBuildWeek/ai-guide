"""The only way spend gets recorded. One row per paid provider call."""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.budget import charge
from app.models import CostLedger, Job
from app.pricing import cost


def record(session: Session, *, job: Job | None, provider: str, pricing_provider: str, model: str,
           tier: str, operation: str, units: dict[str, int], on: date,
           script_id: int | None = None, segment_id: int | None = None,
           external_request_id: str | None = None) -> Decimal:
    """Price the call, write the ledger row and settle it against the job's budgets.

    `provider` is who actually served the call ("fake-gemini" in tests and offline
    demos); `pricing_provider` is whose price list applies, so simulated runs show what
    the real thing would have cost without being mistaken for real spend.
    """
    amount = cost(session, pricing_provider, model, tier, units, on)
    session.add(CostLedger(
        job_id=job.id if job else None, budget_id=job.budget_id if job else None,
        provider=provider, model=model, tier=tier, operation=operation, units=units,
        cost_usd=amount, script_id=script_id, segment_id=segment_id,
        external_request_id=external_request_id,
    ))
    if job is not None:
        charge(session, job, amount)
    session.flush()
    return amount
