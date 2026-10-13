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
