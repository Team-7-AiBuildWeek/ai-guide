"""Narration TTS. Default: Google Cloud TTS Chirp 3: HD, because it takes SSML
<phoneme> overrides and the pronunciation lexicon is worth more than the price gap.

Billing is per character of the SSML sent, tags included, so the caller computes the
exact cost from the chunks before calling and reserves it. Requests are synchronous
(Cloud TTS has no batch discount) and never streaming (SSML is ignored on streams).
"""

from typing import Protocol

from app.ssml import FAKE_SECONDS_PER_CHAR, silent_mp3


class TTSProvider(Protocol):
    name: str                 # who serves the call, written to the ledger
    pricing_provider: str     # whose price list applies
    model: str                # price-list model name, e.g. "chirp3-hd"

    def synthesize(self, ssml_chunks: list[str], voice_id: str, locale: str) -> list[bytes]: ...


class ChirpTTSProvider:
    name = "google-cloud-tts"
    pricing_provider = "google-cloud-tts"

    def __init__(self, model: str = "chirp3-hd", credentials_json: str | None = None):
        from google.cloud import texttospeech

        self.tts = texttospeech
        credentials = None
        if credentials_json:  # serverless hosts have env vars, not key files
            import json

            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_info(json.loads(credentials_json))
        self.client = texttospeech.TextToSpeechClient(credentials=credentials)
        self.model = model

    def synthesize(self, ssml_chunks: list[str], voice_id: str, locale: str) -> list[bytes]:
        voice = self.tts.VoiceSelectionParams(language_code=locale, name=voice_id)
        audio_config = self.tts.AudioConfig(audio_encoding=self.tts.AudioEncoding.MP3)
        return [
            self.client.synthesize_speech(
                input=self.tts.SynthesisInput(ssml=chunk), voice=voice, audio_config=audio_config
            ).audio_content
            for chunk in ssml_chunks
        ]


class FakeTTSProvider:
    """Silent but valid MP3s of a plausible length. Bills at Chirp prices for demos."""

    name = "fake-tts"
    pricing_provider = "google-cloud-tts"

    def __init__(self, model: str = "chirp3-hd"):
        self.model = model
        self.calls: list[str] = []

    def synthesize(self, ssml_chunks: list[str], voice_id: str, locale: str) -> list[bytes]:
        self.calls.extend(ssml_chunks)
        return [silent_mp3(len(chunk) * FAKE_SECONDS_PER_CHAR) for chunk in ssml_chunks]
