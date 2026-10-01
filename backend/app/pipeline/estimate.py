"""Expected costs, used to plan and to make the first reservation.

These are planning numbers, not the guarantee. The guarantee is that every paid call is
topped up to its worst case (counted input + output cap, or exact TTS characters)
before it is made.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import DEPTHS, Settings
from app.pipeline.prompts import FACT_CHECK_MAX_TOKENS
from app.pricing import cost

CHARS_PER_WORD = 6.5
SSML_OVERHEAD = 1.08
THINKING_TOKENS = 800
PROMPT_OVERHEAD_TOKENS = 500


def tts_chars(depth_level: str) -> int:
    return round(DEPTHS[depth_level].words * CHARS_PER_WORD * SSML_OVERHEAD)


def script_cost(session: Session, settings: Settings, *, depth_level: str, fact_chars: int,
                translate: bool, on: date) -> Decimal:
    words = DEPTHS[depth_level].words
    out_tokens = round(words * 1.6) + THINKING_TOKENS
    if translate:
        return cost(session, "google-gemini", settings.mechanical_model, "batch",
                    {"input_token": out_tokens + PROMPT_OVERHEAD_TOKENS, "output_token": out_tokens}, on, round_up=True)
    in_tokens = min(fact_chars, 12_000) // 4 + PROMPT_OVERHEAD_TOKENS
    draft = cost(session, "google-gemini", settings.script_model, "batch",
                 {"input_token": in_tokens, "output_token": out_tokens}, on, round_up=True)
    check = cost(session, "google-gemini", settings.script_model, "batch",
                 {"input_token": in_tokens + round(words * 1.6), "output_token": min(400, FACT_CHECK_MAX_TOKENS)},
                 on, round_up=True)
    return draft + check


def audio_cost(session: Session, settings: Settings, *, chars: int, on: date) -> Decimal:
    return cost(session, "google-cloud-tts", settings.tts_model, "standard", {"character": chars}, on, round_up=True)


def segment_cost(session: Session, settings: Settings, *, depth_level: str, fact_chars: int,
                 need_script: bool, translate: bool, on: date) -> Decimal:
    total = audio_cost(session, settings, chars=tts_chars(depth_level), on=on)
    if need_script:
        total += script_cost(session, settings, depth_level=depth_level, fact_chars=fact_chars,
                             translate=translate, on=on)
    return total
