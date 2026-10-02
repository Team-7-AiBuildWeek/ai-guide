"""Budget caps are a hard stop, enforced by the database."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.budget import BudgetExceeded, create_budget, reserve, settle
from app.models import Budget, Job
from app.prewarm import prewarm
from app.tours.resolve import TourParams, resolve_tour


def budget_row(sessions, budget_id) -> Budget:
    with sessions() as session:
        return session.get(Budget, budget_id)


def test_reservation_over_cap_raises_and_leaves_budget_untouched(sessions):
    with sessions.begin() as session:
        a = create_budget(session, "prewarm_run", "a", Decimal("1.00"))
        b = create_budget(session, "prewarm_run", "b", Decimal("0.10"))
        reserve(session, [a.id], Decimal("0.60"))
        with pytest.raises(BudgetExceeded):
            reserve(session, [a.id, b.id], Decimal("0.30"))  # fits a, not b: neither keeps it
    assert budget_row(sessions, a.id).reserved_usd == Decimal("0.60")
    assert budget_row(sessions, b.id).reserved_usd == 0


def test_database_check_blocks_overspend_even_without_the_application(sessions):
    with sessions.begin() as session:
        budget_id = create_budget(session, "prewarm_run", "raw", Decimal("1.00")).id
    with pytest.raises(IntegrityError):
        with sessions.begin() as session:
            session.execute(text("UPDATE budgets SET spent_usd = 1.01 WHERE id = :id"), {"id": budget_id})


def test_settle_records_overrun_instead_of_dropping_real_spend(sessions):
    with sessions.begin() as session:
        budget_id = create_budget(session, "prewarm_run", "o", Decimal("1.00")).id
        reserve(session, [budget_id], Decimal("0.90"))
        settle(session, [budget_id], Decimal("0.90"), Decimal("1.25"))  # provider charged more than reserved
    row = budget_row(sessions, budget_id)
    assert (row.reserved_usd, row.spent_usd, row.overrun_usd) == (0, Decimal("1.00"), Decimal("0.25"))


@pytest.mark.parametrize("cap", ["0.05", "0.40", "1.00"])
def test_prewarm_never_exceeds_its_cap(sessions, providers, settings, worker, city, total_spend, cap):
    with sessions.begin() as session:
        report = prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal(cap), top_n=8)
    assert report.reserved_usd <= Decimal(cap)
    worker.drain()
    row = budget_row(sessions, report.budget_id)
    assert row.spent_usd + row.reserved_usd <= Decimal(cap)
    assert row.overrun_usd == 0
    assert row.spent_usd == total_spend()  # the budget saw every ledger row
    assert total_spend() <= Decimal(cap)
    assert row.reserved_usd == 0  # every reservation was settled or released


def test_prewarm_dry_run_spends_and_reserves_nothing(sessions, providers, settings, city, ledger_rows):
    with sessions.begin() as session:
        report = prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal("1"), dry_run=True)
    assert report.queued and report.budget_id is None
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM jobs")) == 0
        assert session.scalar(text("SELECT count(*) FROM budgets")) == 0
    assert ledger_rows() == 0


def test_prewarm_takes_highest_value_first(sessions, providers, settings, city):
    with sessions.begin() as session:
        report = prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal("0.30"),
                         top_n=8, with_tours=False)
    assert report.skipped_over_budget, "budget should be too small for everything"
    everything = report.queued + report.skipped_over_budget
    assert report.queued[0].value == max(c.value for c in everything)
    values = [c.value for c in report.queued]
    assert values == sorted(values, reverse=True)
    # The default combination (en / storyteller / full) of the most popular POI goes first.
    top = report.queued[0]
    assert (top.language, top.persona, top.depth_level) == ("en", "storyteller", "full")


def test_on_demand_request_is_refused_when_the_daily_cap_is_spent(sessions, providers, settings, city):
    with sessions.begin() as session:
        session.execute(text("INSERT INTO budgets (scope, label, day, cap_usd, spent_usd) "
                             "VALUES ('daily', 'today', :d, :cap, :cap)"),
                        {"d": datetime.now(UTC).date(), "cap": settings.daily_budget_usd})
    with pytest.raises(BudgetExceeded):
        with sessions.begin() as session:
            resolve_tour(session, TourParams(city_id=city.id, duration_min=30), providers, settings)
    with sessions() as session:  # the whole request rolled back
        assert session.scalar(text("SELECT count(*) FROM tours")) == 0
        assert session.scalar(text("SELECT count(*) FROM jobs")) == 0


def test_worker_stops_work_its_budget_can_no_longer_cover(sessions, providers, settings, worker, city, ledger_rows):
    with sessions.begin() as session:
        r = resolve_tour(session, TourParams(city_id=city.id, duration_min=20), providers, settings)
        # Simulate the cap being lowered after the work was queued: nothing left beyond what is reserved.
        session.execute(text("UPDATE budgets SET cap_usd = reserved_usd WHERE id = :id"), {"id": r.request.budget_id})
    with sessions.begin() as session:  # and the reservation shrunk below a draft's worst case
        session.execute(text("UPDATE jobs SET reserved_usd = 0"))
        session.execute(text("UPDATE budgets SET reserved_usd = 0, cap_usd = 0.000001 WHERE id = :id"),
                        {"id": r.request.budget_id})
    worker.drain()
    assert ledger_rows() == 0
    assert providers.llm.submitted == []  # no paid call was made
    with sessions() as session:
        statuses = set(session.scalars(select(Job.status)))
    assert statuses == {"over_budget"}


def test_work_waits_for_budget_held_by_other_work_instead_of_giving_up(sessions, providers, settings, worker, city):
    """A worst-case reservation that settles lower gives money back; the job that could
    not get budget meanwhile must wait for it, not be dropped."""
    from app.budget import create_budget
    from app.pipeline.work import Funding, claim_script, enqueue_script
    from app.models import Poi
    from datetime import UTC, datetime
    with sessions.begin() as session:
        budget = create_budget(session, "prewarm_run", "tight", Decimal("1"))
        pois = session.scalars(select(Poi).order_by(Poi.id)).all()[:2]
        for poi in pois:
            script = claim_script(session, poi, "en", "storyteller", "short", settings)
            enqueue_script(session, script, poi, Funding(budget.id), settings, providers.tts, datetime.now(UTC).date())
        # The first job is in flight and its worst case holds the rest of the cap.
        session.execute(text("UPDATE budgets SET reserved_usd = cap_usd WHERE id = :id"), {"id": budget.id})
        first = session.scalars(select(Job).order_by(Job.id)).first()
        session.execute(text("UPDATE jobs SET reserved_usd = 0 WHERE id <> :id"), {"id": first.id})
        session.execute(text("UPDATE jobs SET reserved_usd = 1, status = 'submitted', external_batch_id = 'x' "
                             "WHERE id = :id"), {"id": first.id})
    worker.submit_script_batches()
    with sessions() as session:
        waiting = session.scalars(select(Job).where(Job.error.like("waiting for budget%"))).all()
        assert waiting and all(j.status == "queued" for j in waiting)
        assert session.scalar(text("SELECT count(*) FROM jobs WHERE status = 'over_budget'")) == 0


def test_work_stops_for_good_when_nothing_else_holds_budget(sessions, providers, settings, worker, city):
    from app.tours.resolve import TourParams, resolve_tour
    with sessions.begin() as session:
        r = resolve_tour(session, TourParams(city_id=city.id, duration_min=20), providers, settings)
        session.execute(text("UPDATE jobs SET reserved_usd = 0"))
        session.execute(text("UPDATE budgets SET reserved_usd = 0, cap_usd = 0.000001 WHERE id = :id"),
                        {"id": r.request.budget_id})
    worker.drain()
    with sessions() as session:
        assert set(session.scalars(select(Job.status))) == {"over_budget"}
