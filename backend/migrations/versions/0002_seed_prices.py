"""Seed the price list verified on 2026-10-01."""
from migrations.sqlfile import run_sql

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    run_sql("0002_seed_prices.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
