"""The default voice: Gemini TTS through the Batch API."""

import io
import wave
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.audio import mp3_duration_ms, pcm_from
from app.pipeline.work import planned_segment
from app.pipeline.worker import Worker
from app.prewarm import prewarm
from app.pricing import cost
from app.providers import Providers
from app.providers.llm import FakeLLMProvider
from app.providers.routing import FakeRoutingProvider
from app.providers.tts import FakeBatchTTSProvider, GeminiBatchTTSProvider, TTSBatchPoll, TTSResult
from app.models import Script, Segment
from app.tours.resolve import TourParams, resolve_tour


@pytest.fixture
def gemini(sessions, storage, settings):
    providers = Providers(llm=FakeLLMProvider(), tts=FakeBatchTTSProvider(), routing=FakeRoutingProvider())
    return providers, Worker(sessions, providers, storage, settings)


def request(sessions, providers, settings, **params):
    with sessions.begin() as session:
        return resolve_tour(session, TourParams(**params), providers, settings)


def test_tour_is_voiced_through_one_batch_and_every_cent_is_accounted(sessions, settings, city, gemini, engine, storage):
    providers, worker = gemini
    r = request(sessions, providers, settings, city_id=city.id, duration_min=45)
    worker.drain()
    n = r.request.segments_total
    assert len(providers.tts.submitted) == n
    with sessions() as session:
        assert session.scalar(text(f"SELECT status FROM tours WHERE id = {r.tour.id}")) == "ready"
        segments = session.scalars(select(Segment)).all()
    assert all(s.tts_model == "gemini-3.8-flash-tts" and s.voice_id == "Charon" for s in segments)
    for s in segments:
        data, content_type = storage.objects[s.audio_key]
        assert content_type == "audio/mpeg" and mp3_duration_ms(data) == s.duration_ms > 1000
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT tier, model, units FROM cost_ledger WHERE operation = 'tts'")).all()
        spent = conn.execute(text("SELECT sum(spent_usd), sum(reserved_usd), sum(overrun_usd) FROM budgets "
                                  "WHERE scope = 'tour_request'")).one()
        ledger = conn.execute(text("SELECT sum(cost_usd) FROM cost_ledger")).scalar_one()
    assert len(rows) == n and all(t == "batch" and m == "gemini-3.8-flash-tts" for t, m, _ in rows)
    assert all(u["output_token"] > 0 for _, _, u in rows)
    assert spent == (ledger, 0, 0)


def test_a_gemini_stop_costs_a_fraction_of_chirp(sessions):
    on = date(2026, 10, 2)
    four_minutes = {"input_token": 900, "output_token": 240 * 32}
    with sessions() as session:
        gemini = cost(session, "google-gemini", "gemini-3.8-flash-tts", "batch", four_minutes, on)
        chirp = cost(session, "google-cloud-tts", "chirp3-hd", "standard", {"character": 3500}, on)
        january = cost(session, "google-gemini", "gemini-3.8-flash-tts", "batch", four_minutes, date(2027, 1, 1))
    assert gemini < Decimal("0.04") < chirp
    assert january == pytest.approx(gemini * 2, abs=Decimal("0.000002"))


def test_prewarm_cap_holds_with_the_batch_voice(sessions, settings, city, gemini, total_spend):
    providers, worker = gemini
    with sessions.begin() as session:
        report = prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal("0.25"), top_n=8)
    worker.drain()
    with sessions() as session:
        row = session.execute(text(f"SELECT cap_usd, reserved_usd, spent_usd, overrun_usd FROM budgets "
                                   f"WHERE id = {report.budget_id}")).one()
    assert row.spent_usd == total_spend() <= row.cap_usd
    assert row.reserved_usd == 0 and row.overrun_usd == 0


def test_a_cut_off_recording_is_paid_for_retried_and_never_served(sessions, settings, city, gemini, ledger_rows):
    providers, worker = gemini
    real_poll = providers.tts.poll

    def truncated(batch_id: str) -> TTSBatchPoll:
        polled = real_poll(batch_id)
        return TTSBatchPoll(polled.state, [TTSResult(r.key, None, None, "incomplete audio (MAX_TOKENS)",
                                                     r.input_tokens, r.output_tokens) for r in polled.results])

    providers.tts.poll = truncated
    r = request(sessions, providers, settings, city_id=city.id, duration_min=10)
    for _ in range(4):
        worker.drain()
        with sessions.begin() as session:
            session.execute(text("UPDATE jobs SET run_after = now() WHERE status = 'queued'"))
    n = r.request.segments_total
    assert ledger_rows("operation = 'tts'") == 3 * n  # every attempt that was billed is recorded
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM segments WHERE status = 'failed'")) == n
        assert session.scalar(text(f"SELECT status FROM tours WHERE id = {r.tour.id}")) == "failed"


def test_lexicon_edits_do_not_rerecord_gemini_audio(sessions, settings, city, gemini):
    providers, worker = gemini
    request(sessions, providers, settings, city_id=city.id, duration_min=30)
    worker.drain()
    with sessions.begin() as session:
        before = {s.id: s.input_hash for s in session.scalars(select(Segment))}
        session.execute(text("INSERT INTO pronunciation_lexicon (locale, surface_form, alphabet, phoneme) "
                             "VALUES ('en-US', 'Main Square', 'ipa', 'meɪn skwɛər')"))
    with sessions() as session:
        for segment in session.scalars(select(Segment)):
            new_hash, _ = planned_segment(session, session.get(Script, segment.script_id), settings, providers.tts)
            assert new_hash == before[segment.id]


def test_gemini_tts_is_batch_only():
    public = {m for m in dir(GeminiBatchTTSProvider) if not m.startswith("_") and callable(getattr(GeminiBatchTTSProvider, m))}
    assert "synthesize" not in public
    assert {"submit", "poll", "find_batch"} <= public
    assert GeminiBatchTTSProvider.tier == "batch" and GeminiBatchTTSProvider.mode == "batch"


def test_pcm_is_read_from_wav_or_raw_l16():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(b"\x01\x00" * 480)
    assert pcm_from(buffer.getvalue(), "audio/wav") == (b"\x01\x00" * 480, 24000)
    assert pcm_from(b"\x00\x00" * 10, "audio/L16;codec=pcm;rate=16000") == (b"\x00\x00" * 10, 16000)
