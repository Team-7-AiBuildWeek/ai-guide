"""Prices for Kokoro-82M on DeepInfra, the voice for the languages it speaks."""
from migrations.sqlfile import run_sql

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    run_sql("0006_kokoro_prices.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
