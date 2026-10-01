"""Migrations are plain .sql files; Alembic only tracks which ones have run."""

from pathlib import Path

from alembic import op

SQL_DIR = Path(__file__).parent / "sql"


def run_sql(name: str) -> None:
    op.execute((SQL_DIR / name).read_text())
