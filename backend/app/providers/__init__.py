"""Provider wiring. Real providers by default; LLM/TTS/ROUTING_PROVIDER=fake for offline."""

from dataclasses import dataclass

from app.config import Settings
from app.providers.llm import FakeLLMProvider, GeminiBatchProvider, LLMBatchProvider
from app.providers.routing import FakeRoutingProvider, OpenRouteServiceProvider, RoutingProvider
from app.providers.tts import ChirpTTSProvider, FakeTTSProvider, TTSProvider


@dataclass
class Providers:
    llm: LLMBatchProvider
    tts: TTSProvider
    routing: RoutingProvider


def _require(value: str | None, name: str) -> str:
    if not value:
        raise RuntimeError(f"{name} is not set. Set it, or use the fake provider for offline runs.")
    return value


def build_providers(settings: Settings) -> Providers:
    llm = (FakeLLMProvider() if settings.llm_provider == "fake"
           else GeminiBatchProvider(_require(settings.gemini_api_key, "GEMINI_API_KEY")))
    tts = (FakeTTSProvider(settings.tts_model) if settings.tts_provider == "fake"
           else ChirpTTSProvider(settings.tts_model))
    routing = (FakeRoutingProvider(settings.walking_speed_m_s) if settings.routing_provider == "fake"
               else OpenRouteServiceProvider(_require(settings.ors_api_key, "ORS_API_KEY")))
    return Providers(llm=llm, tts=tts, routing=routing)
