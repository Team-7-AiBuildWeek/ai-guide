"""Hard spend caps.

Every paid call is covered by a reservation made *before* the call. Reservations are a
single UPDATE against budgets; the budget_hard_cap CHECK rejects one that would take
reserved + spent over the cap, so the stop is enforced by Postgres even if two workers
race. After the call the reservation is settled to the actual cost.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Budget, Job


class BudgetExceeded(Exception):
    def __init__(self, budget_id: int, amount: Decimal):
        super().__init__(f"budget {budget_id} cannot cover ${amount}")
        self.budget_id = budget_id
        self.amount = amount


def create_budget(session: Session, scope: str, label: str, cap_usd: Decimal) -> Budget:
    budget = Budget(scope=scope, label=label, cap_usd=cap_usd)
    session.add(budget)
    session.flush()
    return budget


def daily_budget(session: Session, day: date, cap_usd: Decimal) -> Budget:
    session.execute(
        insert(Budget).values(scope="daily", label=f"daily {day}", day=day, cap_usd=cap_usd)
        .on_conflict_do_nothing(index_elements=["day"], index_where=text("scope = 'daily'"))
    )
    return session.scalars(select(Budget).where(Budget.scope == "daily", Budget.day == day)).one()


def reserve(session: Session, budget_ids: list[int], amount: Decimal) -> None:
    """Reserve `amount` on every budget, or on none (savepoint)."""
    if amount <= 0:
        return
    for budget_id in budget_ids:
        try:
            with session.begin_nested():
                session.execute(
                    text("UPDATE budgets SET reserved_usd = reserved_usd + :a WHERE id = :id"),
                    {"a": amount, "id": budget_id},
                )
        except IntegrityError as exc:
            # Undo the budgets already reserved in this call.
            done = budget_ids[: budget_ids.index(budget_id)]
            release(session, done, amount)
            raise BudgetExceeded(budget_id, amount) from exc


def release(session: Session, budget_ids: list[int], amount: Decimal) -> None:
    if amount <= 0:
        return
    for budget_id in budget_ids:
        session.execute(
            text("UPDATE budgets SET reserved_usd = GREATEST(reserved_usd - :a, 0) WHERE id = :id"),
            {"a": amount, "id": budget_id},
        )


def settle(session: Session, budget_ids: list[int], reserved: Decimal, actual: Decimal) -> None:
    """Swap `reserved` for `actual` spend. Never fails: whatever the cap cannot absorb is
    recorded as overrun, because real spend must never be dropped to satisfy a CHECK."""
    for budget_id in budget_ids:
        session.execute(
            text("""
                UPDATE budgets SET
                    reserved_usd = reserved_usd - :r,
                    spent_usd    = spent_usd + LEAST(:a, cap_usd - (reserved_usd - :r) - spent_usd),
                    overrun_usd  = overrun_usd + GREATEST(:a - (cap_usd - (reserved_usd - :r) - spent_usd), 0)
                WHERE id = :id
            """),
            {"r": reserved, "a": actual, "id": budget_id},
        )


# --- per-job helpers: a job holds the part of its budgets' reservations it may still spend


def job_budget_ids(job: Job) -> list[int]:
    return [b for b in (job.budget_id, job.daily_budget_id) if b is not None]


def ensure_reserved(session: Session, job: Job, needed: Decimal) -> None:
    """Top the job's held reservation up to `needed` before a paid call."""
    if job.reserved_usd < needed:
        reserve(session, job_budget_ids(job), needed - job.reserved_usd)
        job.reserved_usd = needed


def charge(session: Session, job: Job, actual: Decimal) -> None:
    covered = min(actual, job.reserved_usd)
    settle(session, job_budget_ids(job), covered, actual)
    job.reserved_usd -= covered


def release_job(session: Session, job: Job) -> None:
    release(session, job_budget_ids(job), job.reserved_usd)
    job.reserved_usd = Decimal(0)
