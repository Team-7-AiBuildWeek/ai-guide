"""Same inputs -> same hash -> no second row, enforced by Postgres, not by luck."""

import threading
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.budget import create_budget
from app.hashing import facts_hash, script_hash
from app.models import Job, Poi, Script
from app.pipeline.work import Funding, claim_script, enqueue_script
from app.providers.tts import FakeTTSProvider


def test_hash_is_stable_and_covers_the_cache_key():
    base = dict(poi_id=1, language="en", persona="historian", depth_level="full", script_version=1,
                facts_hash=facts_hash(["b", "a"]))
    assert script_hash(**base) == script_hash(**{**base, "facts_hash": facts_hash(["a", "b"])})
    for field, other in (("poi_id", 2), ("language", "de"), ("persona", "family"), ("depth_level", "short"),
                         ("script_version", 2), ("facts_hash", facts_hash(["c"]))):
        assert script_hash(**base) != script_hash(**{**base, field: other}), field


def test_database_rejects_a_duplicate_script(sessions, city, settings):
    with sessions.begin() as session:
        poi = session.scalars(select(Poi)).first()
        claim_script(session, poi, "en", "historian", "full", settings)
    with pytest.raises(IntegrityError):
        with sessions.begin() as session:
            existing = session.scalars(select(Script)).one()
            session.execute(text(
                "INSERT INTO scripts (poi_id, language, persona, depth_level, script_version, facts_hash, input_hash) "
                "VALUES (:p, 'en', 'historian', 'full', 1, :f, :h)"),
                {"p": existing.poi_id, "f": existing.facts_hash, "h": existing.input_hash})


def test_database_rejects_a_second_live_job_for_the_same_work(sessions, city, settings):
    with sessions.begin() as session:
        session.execute(text("INSERT INTO jobs (job_type, payload, dedupe_key) VALUES ('script', '{}', 'script:x')"))
    with pytest.raises(IntegrityError):
        with sessions.begin() as session:
            session.execute(text("INSERT INTO jobs (job_type, payload, dedupe_key) VALUES ('script', '{}', 'script:x')"))
    # Once the first one is finished, the same work may be queued again (e.g. a retry).
    with sessions.begin() as session:
        session.execute(text("UPDATE jobs SET status = 'failed'"))
        session.execute(text("INSERT INTO jobs (job_type, payload, dedupe_key) VALUES ('script', '{}', 'script:x')"))


def test_concurrent_requests_for_the_same_miss_create_one_script_one_job_one_reservation(sessions, city, settings):
    with sessions.begin() as session:
        poi_id = session.scalars(select(Poi.id)).first()
        budget_ids = [create_budget(session, "tour_request", f"r{i}", Decimal("5")).id for i in range(8)]
    barrier = threading.Barrier(len(budget_ids))
    errors: list[BaseException] = []

    def claim(budget_id: int) -> None:
        try:
            with sessions.begin() as session:
                poi = session.get(Poi, poi_id)
                barrier.wait()
                script = claim_script(session, poi, "en", "storyteller", "full", settings)
                enqueue_script(session, script, poi, Funding(budget_id), settings, FakeTTSProvider(), on=_today())
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=claim, args=(b,)) for b in budget_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM scripts")) == 1
        assert session.scalar(text("SELECT count(*) FROM jobs")) == 1
        reserved = session.scalars(text("SELECT reserved_usd FROM budgets WHERE reserved_usd > 0")).all()
        job = session.scalars(select(Job)).one()
    assert len(reserved) == 1 and reserved[0] == job.reserved_usd  # exactly one requester pays


def _today():
    from datetime import UTC, datetime
    return datetime.now(UTC).date()


def test_hosted_postgres_urls_are_given_the_psycopg_driver():
    from app.config import sqlalchemy_url
    assert sqlalchemy_url("postgres://u:p@h/db?sslmode=require") == "postgresql+psycopg://u:p@h/db?sslmode=require"
    assert sqlalchemy_url("postgresql://u@h/db") == "postgresql+psycopg://u@h/db"
    assert sqlalchemy_url("postgresql+psycopg://u@h/db") == "postgresql+psycopg://u@h/db"
