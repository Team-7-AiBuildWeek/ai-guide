"""Prices for Gemini 2.5 Flash Preview TTS, the live narration's voice."""
from migrations.sqlfile import run_sql

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    run_sql("0004_live_voice_prices.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
