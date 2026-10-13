"""Segments can be retired: replaced, and their audio deleted."""
from migrations.sqlfile import run_sql

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    run_sql("0005_retired_segments.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
