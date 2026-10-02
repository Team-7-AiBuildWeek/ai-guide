"""Provider wiring. Real providers by default; BACKEND_{LLM,TTS,ROUTING}_PROVIDER=fake for offline.

Prefixed because on Vercel the web app and this backend share one set of environment
variables, and the web app already uses LLM_PROVIDER and TTS_PROVIDER for itself.
"""

from dataclasses import dataclass

from app.config import Settings
from app.providers.llm import FakeLLMProvider, GeminiBatchProvider, LLMBatchProvider
from app.providers.routing import (FakeRoutingProvider, OpenRouteServiceProvider, RoutingProvider,
                                   StraightLineRoutingProvider)
from app.providers.tts import ChirpTTSProvider, FakeTTSProvider, GeminiBatchTTSProvider, TTSProvider


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
    if settings.tts_provider == "fake":
        tts: TTSProvider = FakeTTSProvider()
    elif settings.tts_provider == "chirp":
        tts = ChirpTTSProvider(settings.tts_model or "chirp3-hd", settings.google_credentials_json)
    else:
        tts = GeminiBatchTTSProvider(_require(settings.gemini_api_key, "GEMINI_API_KEY"),
                                     settings.tts_model or "gemini-3.8-flash-tts")
    if settings.routing_provider == "fake":
        routing: RoutingProvider = FakeRoutingProvider(settings.walking_speed_m_s)
    elif settings.routing_provider == "straight":
        routing = StraightLineRoutingProvider(settings.walking_speed_m_s)
    else:
        routing = OpenRouteServiceProvider(_require(settings.ors_api_key, "ORS_API_KEY"))
    return Providers(llm=llm, tts=tts, routing=routing)
