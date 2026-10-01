"""Every paid call writes exactly one ledger row, priced from the dated price list."""

from datetime import date
from decimal import Decimal

import pytest

from app.pricing import PriceMissing, cost
from app.tours.resolve import TourParams, resolve_tour


def test_every_provider_call_has_exactly_one_ledger_row(sessions, providers, settings, worker, city, ledger_rows):
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=45), providers, settings)
    worker.drain()
    llm_calls = len(providers.llm.submitted)
    tts_segments = ledger_rows("operation = 'tts'")
    assert llm_calls > 0 and tts_segments > 0
    assert ledger_rows("operation IN ('draft', 'check', 'translate')") == llm_calls
    assert ledger_rows("cost_usd > 0") == ledger_rows()
    # Simulated runs are labelled as such but priced at the real provider's list price.
    assert ledger_rows("provider IN ('fake-gemini', 'fake-tts')") == ledger_rows()


def test_tts_rows_bill_the_ssml_characters_sent(sessions, providers, settings, worker, city, engine):
    from sqlalchemy import text
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=20), providers, settings)
    worker.drain()
    sent = sum(len(chunk) for chunk in providers.tts.calls)
    with engine.connect() as conn:
        billed = conn.execute(text("SELECT sum((units->>'character')::int) FROM cost_ledger WHERE operation = 'tts'")).scalar_one()
    assert billed == sent


def test_gemini_prices_double_on_1_january_2027(sessions):
    units = {"input_token": 1_000_000, "output_token": 1_000_000}
    with sessions() as session:
        december = cost(session, "google-gemini", "gemini-3.8-flash", "batch", units, date(2026, 12, 31))
        january = cost(session, "google-gemini", "gemini-3.8-flash", "batch", units, date(2027, 1, 1))
    assert december == Decimal("2.250000")
    assert january == Decimal("4.500000")


def test_chirp_is_priced_per_character(sessions):
    with sessions() as session:
        assert cost(session, "google-cloud-tts", "chirp3-hd", "standard", {"character": 3500}, date(2026, 10, 1)) \
            == Decimal("0.105000")


def test_unknown_price_refuses_rather_than_spending_unrecorded(sessions):
    with sessions() as session, pytest.raises(PriceMissing):
        cost(session, "google-gemini", "gemini-9-ultra", "batch", {"input_token": 1}, date(2026, 10, 1))
