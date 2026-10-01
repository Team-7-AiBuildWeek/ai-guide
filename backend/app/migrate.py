"""Applying migrations from code, for hosts with no deploy hook (Vercel functions).

Several instances may cold-start at once, so the upgrade runs under a Postgres
advisory lock: one applies the migrations, the others wait and then find nothing
to do.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent
LOCK_ID = 7_202_610  # arbitrary, stable


def upgrade_to_head(database_url: str) -> None:
    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
            try:
                config = Config(str(ROOT / "alembic.ini"))
                config.set_main_option("script_location", str(ROOT / "migrations"))
                config.set_main_option("prepend_sys_path", str(ROOT))
                config.attributes["database_url"] = database_url
                command.upgrade(config, "head")
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
    finally:
        engine.dispose()
