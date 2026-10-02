"""Prices for Gemini 3.8 Flash TTS."""
from migrations.sqlfile import run_sql

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    run_sql("0003_gemini_tts_prices.sql")


def downgrade() -> None:
    raise NotImplementedError("Write a forward migration instead.")
