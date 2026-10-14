"""kokoro+gemini: Kokoro (DeepInfra) for the languages it speaks, Gemini for the rest."""

import pytest
from sqlalchemy import select, text

from app.models import Segment
from app.pipeline.worker import Worker
from app.providers import Providers
from app.providers.llm import FakeLLMProvider
from app.providers.routing import FakeRoutingProvider
from app.providers.tts import (GeminiTTSProvider, KokoroTTSProvider, LanguageRoutedTTS, delivery_prompt,
                               kokoro_voices, voice_provider)
from app.ssml import silent_mp3
from app.tours.resolve import TourParams, resolve_tour


class FakeKokoro(KokoroTTSProvider):
    """KokoroTTSProvider's shape and pricing, without the network."""

    def __init__(self, voices: str | None = None):
        self.model = "hexgrad/Kokoro-82M"
        self.voices = kokoro_voices(voices)
        self.speed = 0.9
        self.calls: list[tuple[str, str]] = []

    def synthesize(self, chunks, voice_id, locale):
        self.calls.extend((voice_id, c) for c in chunks)
        return [silent_mp3(3.0) for _ in chunks]


class FakeGemini(GeminiTTSProvider):
    def __init__(self):
        self.model = "gemini-2.5-flash-preview-tts"
        self.prompts: list[str] = []

    def synthesize_billed(self, chunks, voice_id, locale):
        self.prompts.extend(delivery_prompt("German", c) for c in chunks)
        return [silent_mp3(3.0) for _ in chunks], {"input_token": 100, "output_token": 75}


@pytest.fixture
def routed(sessions, storage, settings):
    tts = LanguageRoutedTTS(FakeKokoro(), FakeGemini())
    providers = Providers(llm=FakeLLMProvider(), tts=tts, routing=FakeRoutingProvider())
    return providers, Worker(sessions, providers, storage, settings)


def test_english_is_voiced_by_kokoro_and_billed_per_character(sessions, settings, city, routed, engine):
    providers, worker = routed
    with sessions.begin() as session:
        r = resolve_tour(session, TourParams(city_id=city.id, duration_min=45, language="en"), providers, settings)
    worker.drain()
    n = r.request.segments_total
    assert len(providers.tts.kokoro.calls) == n and not providers.tts.other.prompts
    assert {v for v, _ in providers.tts.kokoro.calls} == {"af_heart"}
    with sessions() as session:
        assert session.scalar(text(f"SELECT status FROM tours WHERE id = {r.tour.id}")) == "ready"
        segments = session.scalars(select(Segment)).all()
    assert all(s.tts_provider == "deepinfra" and s.voice_id == "af_heart" for s in segments)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT provider, model, units, cost_usd FROM cost_ledger WHERE operation = 'tts'")).all()
    assert len(rows) == n
    assert all(p == "deepinfra" and m == "hexgrad/Kokoro-82M" and set(u) == {"character"} and c > 0
               for p, m, u, c in rows)


def test_a_language_kokoro_cannot_speak_stays_with_gemini(sessions, settings, city, routed, engine):
    providers, worker = routed
    with sessions.begin() as session:
        resolve_tour(session, TourParams(city_id=city.id, duration_min=45, language="de"), providers, settings)
    worker.drain()
    assert providers.tts.other.prompts and not providers.tts.kokoro.calls
    with sessions() as session:
        segments = session.scalars(select(Segment).where(Segment.language == "de")).all()
    assert segments and all(s.tts_provider == "google-gemini" and s.voice_id == "Charon" for s in segments)


def test_voice_overrides_must_belong_to_the_language():
    assert kokoro_voices("en=bm_george")["en"] == "bm_george"
    assert kokoro_voices("pt=em_alex")["pt"] == "pf_dora"  # a Spanish voice would misread Portuguese
    assert "sk" not in kokoro_voices("sk=bf_emma")


def test_routing_needs_a_synchronous_voice_for_the_rest():
    class Batchy:
        name, model, mode = "batch-voice", "m", "batch"

    with pytest.raises(ValueError):
        LanguageRoutedTTS(FakeKokoro(), Batchy())
    tts = LanguageRoutedTTS(FakeKokoro(), FakeGemini())
    assert voice_provider(tts, "en") is tts.kokoro and voice_provider(tts, "sk") is tts.other
