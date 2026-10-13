"""The live narration's voice: Gemini 2.5 Flash TTS, synchronous, with the delivery note."""

import pytest
from sqlalchemy import select, text

from app.audio import mp3_duration_ms
from app.hashing import audio_hash
from app.pipeline.worker import Worker
from app.providers import Providers
from app.providers.llm import FakeLLMProvider
from app.providers.routing import FakeRoutingProvider
from app.providers.tts import DELIVERY_NOTE, GeminiTTSProvider, delivery_prompt
from app.models import Segment
from app.ssml import silent_mp3
from app.tours.resolve import TourParams, resolve_tour


class FakeLiveTTS(GeminiTTSProvider):
    """GeminiTTSProvider's shape and pricing, without the network."""

    def __init__(self):
        self.model = "gemini-2.5-flash-preview-tts"
        self.prompts: list[str] = []

    def synthesize_billed(self, chunks, voice_id, locale):
        self.prompts.extend(delivery_prompt("English", c) for c in chunks)
        return [silent_mp3(3.0) for _ in chunks], {"input_token": 100, "output_token": 75}


@pytest.fixture
def live(sessions, storage, settings):
    providers = Providers(llm=FakeLLMProvider(), tts=FakeLiveTTS(), routing=FakeRoutingProvider())
    return providers, Worker(sessions, providers, storage, settings)


def test_tour_is_voiced_in_the_live_voice_and_billed_in_tokens(sessions, settings, city, live, engine, storage):
    providers, worker = live
    with sessions.begin() as session:
        r = resolve_tour(session, TourParams(city_id=city.id, duration_min=45), providers, settings)
    worker.drain()
    n = r.request.segments_total
    assert len(providers.tts.prompts) == n
    assert all(DELIVERY_NOTE in p and p.startswith("Read the following aloud in English") for p in providers.tts.prompts)
    with sessions() as session:
        assert session.scalar(text(f"SELECT status FROM tours WHERE id = {r.tour.id}")) == "ready"
        segments = session.scalars(select(Segment)).all()
    assert all(s.tts_model == "gemini-2.5-flash-preview-tts" and s.voice_id == "Charon" for s in segments)
    for s in segments:
        data, _ = storage.objects[s.audio_key]
        assert mp3_duration_ms(data) == s.duration_ms
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT tier, units FROM cost_ledger WHERE operation = 'tts'")).all()
    assert len(rows) == n and all(t == "standard" and u == {"input_token": 100, "output_token": 75} for t, u in rows)


def test_delivery_is_part_of_the_audio_identity_only_when_given():
    base = dict(script_input_hash="s", script_text="t", tts_provider="p", tts_model="m", voice_id="v", lexicon_hash="l")
    assert audio_hash(**base) == audio_hash(**base, delivery="")
    assert audio_hash(**base) != audio_hash(**base, delivery=DELIVERY_NOTE)


def test_a_new_voice_reaches_tours_built_with_the_old_one(sessions, settings, city, live, storage):
    from app.pipeline.worker import finalize_tours
    from app.providers.tts import FakeTTSProvider

    old = Providers(llm=FakeLLMProvider(), tts=FakeTTSProvider(), routing=FakeRoutingProvider())
    with sessions.begin() as session:
        r = resolve_tour(session, TourParams(city_id=city.id, duration_min=45), old, settings)
    Worker(sessions, old, storage, settings).drain()
    providers, worker = live
    with sessions.begin() as session:  # what `walk revoice` does
        from app.pipeline.work import Funding, claim_segment, enqueue_audio
        from app.budget import create_budget
        from app.models import Script
        from datetime import UTC, datetime
        from decimal import Decimal
        budget = create_budget(session, "prewarm_run", "revoice test", Decimal(10))
        for script in session.scalars(select(Script).where(Script.status == "ready")):
            enqueue_audio(session, claim_segment(session, script, settings, providers.tts), Funding(budget.id),
                          settings, providers.tts, datetime.now(UTC).date())
    worker.drain()
    with sessions.begin() as session:
        finalize_tours(session)
        models = session.execute(text(
            f"SELECT sg.tts_model FROM tour_stops ts JOIN segments sg ON sg.id = ts.segment_id WHERE ts.tour_id = {r.tour.id}"
        )).scalars().all()
    assert models and set(models) == {"gemini-2.5-flash-preview-tts"}


def test_replaced_recordings_are_deleted_once_nothing_can_play_them(sessions, settings, city, live, storage):
    from datetime import UTC, datetime, timedelta
    from decimal import Decimal

    from app.budget import create_budget
    from app.models import Script
    from app.pipeline.work import Funding, claim_segment, enqueue_audio
    from app.providers.tts import FakeTTSProvider

    old = Providers(llm=FakeLLMProvider(), tts=FakeTTSProvider(), routing=FakeRoutingProvider())
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=45), old, settings)
    Worker(sessions, old, storage, settings).drain()
    with sessions() as session:
        old_keys = set(session.scalars(select(Segment.audio_key).where(Segment.status == "ready")))
    providers, worker = live
    with sessions.begin() as session:
        budget = create_budget(session, "prewarm_run", "revoice test", Decimal(10))
        for script in session.scalars(select(Script).where(Script.status == "ready")):
            enqueue_audio(session, claim_segment(session, script, settings, providers.tts), Funding(budget.id),
                          settings, providers.tts, datetime.now(UTC).date())
    worker.drain()
    assert worker.retire_replaced_audio() == 0  # replacements are new: links may still be in use
    assert old_keys <= set(storage.objects)
    with sessions.begin() as session:
        session.execute(text("UPDATE segments SET updated_at = :t WHERE tts_model = 'gemini-2.5-flash-preview-tts'"),
                        {"t": datetime.now(UTC) - timedelta(days=2)})
    assert worker.retire_replaced_audio() == len(old_keys)
    assert not old_keys & set(storage.objects)
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM segments WHERE status = 'retired' AND audio_key IS NULL")) \
            == len(old_keys)
        assert session.scalar(text("SELECT count(*) FROM segments WHERE status = 'ready'")) == len(old_keys)
