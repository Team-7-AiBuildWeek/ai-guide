"""Tests run against a real Postgres: the guarantees under test (unique hashes, the budget
CHECK, SKIP LOCKED) live in the database, so a fake one would prove nothing.

TEST_DATABASE_URL defaults to the docker-compose Postgres. The schema is rebuilt with
the real Alembic migrations once per session and every table except the price list is
truncated between tests.
"""

import dataclasses
import os
from decimal import Decimal

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.ingest.demo import seed_demo
from app.pipeline.worker import Worker
from app.providers import Providers
from app.providers.llm import FakeLLMProvider
from app.providers.routing import FakeRoutingProvider
from app.providers.tts import FakeTTSProvider
from app.storage import MemoryStorage

ROOT = os.path.dirname(os.path.dirname(__file__))
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://walk:walk@localhost:5432/walk_test")
KEEP = {"model_prices", "alembic_version"}


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    config = Config(os.path.join(ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(ROOT, "migrations"))
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    command.upgrade(config, "head")
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def clean(engine):
    with engine.begin() as conn:
        tables = [r[0] for r in conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))]
        conn.execute(text(f"TRUNCATE {', '.join(t for t in tables if t not in KEEP)} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def sessions(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def settings():
    return dataclasses.replace(
        Settings(), llm_provider="fake", tts_provider="fake", routing_provider="fake",
        request_budget_usd=Decimal("3.00"), daily_budget_usd=Decimal("20.00"), admin_token="test-admin",
        worker_secret="test-worker",
    )


@pytest.fixture
def providers():
    return Providers(llm=FakeLLMProvider(), tts=FakeTTSProvider(), routing=FakeRoutingProvider())


@pytest.fixture
def storage():
    return MemoryStorage()


@pytest.fixture
def worker(sessions, providers, storage, settings):
    return Worker(sessions, providers, storage, settings)


@pytest.fixture
def city(sessions):
    with sessions.begin() as session:
        return seed_demo(session)


@pytest.fixture
def ledger_rows(engine):
    def count(where: str = "true") -> int:
        with engine.connect() as conn:
            return conn.execute(text(f"SELECT count(*) FROM cost_ledger WHERE {where}")).scalar_one()
    return count


@pytest.fixture
def total_spend(engine):
    def total() -> Decimal:
        with engine.connect() as conn:
            return conn.execute(text("SELECT coalesce(sum(cost_usd), 0) FROM cost_ledger")).scalar_one()
    return total
