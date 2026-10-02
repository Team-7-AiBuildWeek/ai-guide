"""Narration TTS, behind one interface with two shapes.

  * Gemini TTS (default): the same API key as the scripts, sent through the Batch API
    like every other Gemini call, so half price. Plain text in, WAV out, billed per
    audio token. It takes no SSML, so the pronunciation lexicon does not apply.
  * Chirp 3: HD (Google Cloud TTS): SSML with <phoneme> overrides, so the lexicon
    pronounces place names exactly. Synchronous: Cloud TTS has no batch discount, and
    SSML is ignored on streaming requests. Billed per SSML character, tags included.

`mode` tells the worker which shape it is dealing with. The cost of every call is
bounded before it is made: Chirp's exactly (characters), Gemini's by capping the
audio tokens a request may return.
"""

import io
import math
import struct
import uuid
import wave
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.ssml import FAKE_SECONDS_PER_CHAR, Pronunciation, SsmlBuild, build_ssml, lexicon_hash, silent_mp3

SPEECH_WORDS_PER_SECOND = 2.4
SPEECH_CHARS_PER_SECOND = 11.0   # slowest plausible narration: sizes the token cap
GEMINI_AUDIO_TOKENS_PER_SECOND = 32  # measured ~31 on gemini-3.8-flash-tts
GEMINI_MAX_OUTPUT_TOKENS = 16_000    # ~8 minutes of audio; a stop is at most ~4


@dataclass(frozen=True)
class TTSInput:
    """What is sent to the voice, in the pieces it is sent in."""
    chunks: list[str]
    lexicon_hash: str

    @property
    def document(self) -> str:
        return "\n".join(self.chunks)


@dataclass(frozen=True)
class TTSRequest:
    key: str
    text: str
    voice: str
    max_output_tokens: int


@dataclass(frozen=True)
class TTSResult:
    key: str
    audio: bytes | None
    mime_type: str | None
    error: str | None
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def billed_units(self) -> dict[str, int]:
        return {"input_token": self.input_tokens, "output_token": self.output_tokens}


@dataclass
class TTSBatchPoll:
    state: str  # "running" | "succeeded" | "failed"
    results: list[TTSResult] = field(default_factory=list)
    error: str | None = None


class TTSProvider(Protocol):
    name: str              # who serves the call, written to the ledger
    pricing_provider: str  # whose price list applies
    model: str             # price-list model name
    tier: str              # price tier the calls are billed at
    mode: str              # "sync" | "batch"

    def voice_for(self, language: str, voice_name: str) -> str: ...
    def prepare(self, script_text: str, locale: str, lexicon: list[Pronunciation]) -> TTSInput: ...
    def worst_case_units(self, tts_input: TTSInput) -> dict[str, int]: ...
    def expected_units(self, words: int) -> dict[str, int]: ...


# ---------------------------------------------------------------- Chirp 3: HD


class _ChirpPricing:
    pricing_provider = "google-cloud-tts"
    tier = "standard"
    mode = "sync"

    def voice_for(self, language: str, voice_name: str) -> str:
        from app.config import LANGUAGES

        return f"{LANGUAGES[language]}-Chirp3-HD-{voice_name}"  # <locale>-Chirp3-HD-<voice>

    def prepare(self, script_text: str, locale: str, lexicon: list[Pronunciation]) -> TTSInput:
        build: SsmlBuild = build_ssml(script_text, locale, lexicon)
        return TTSInput(chunks=build.chunks, lexicon_hash=build.lexicon_hash)

    def worst_case_units(self, tts_input: TTSInput) -> dict[str, int]:
        return {"character": sum(len(c) for c in tts_input.chunks)}  # exact, tags included

    def expected_units(self, words: int) -> dict[str, int]:
        return {"character": round(words * 6.5 * 1.08)}


class ChirpTTSProvider(_ChirpPricing):
    name = "google-cloud-tts"

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


class FakeTTSProvider(_ChirpPricing):
    """Silent but valid MP3s of a plausible length. Bills at Chirp prices for demos."""

    name = "fake-tts"

    def __init__(self, model: str = "chirp3-hd"):
        self.model = model
        self.calls: list[str] = []

    def synthesize(self, ssml_chunks: list[str], voice_id: str, locale: str) -> list[bytes]:
        self.calls.extend(ssml_chunks)
        return [silent_mp3(len(chunk) * FAKE_SECONDS_PER_CHAR) for chunk in ssml_chunks]


# ----------------------------------------------------------------- Gemini TTS


class _GeminiPricing:
    pricing_provider = "google-gemini"
    tier = "batch"
    mode = "batch"

    def voice_for(self, language: str, voice_name: str) -> str:
        return voice_name  # prebuilt voices speak every supported language

    def prepare(self, script_text: str, locale: str, lexicon: list[Pronunciation]) -> TTSInput:
        # Plain text: Gemini TTS takes no SSML, so lexicon entries cannot be applied
        # and are not part of this audio's identity.
        text = "\n\n".join(p.strip() for p in script_text.split("\n\n") if p.strip())
        return TTSInput(chunks=[text.replace("\n", " ")], lexicon_hash=lexicon_hash(locale, []))

    def max_output_tokens(self, text: str) -> int:
        seconds = len(text) / SPEECH_CHARS_PER_SECOND
        return min(GEMINI_MAX_OUTPUT_TOKENS, math.ceil(seconds * GEMINI_AUDIO_TOKENS_PER_SECOND * 1.5) + 200)

    def worst_case_units(self, tts_input: TTSInput) -> dict[str, int]:
        return {"input_token": len(tts_input.document) // 3 + 50,
                "output_token": self.max_output_tokens(tts_input.document)}

    def expected_units(self, words: int) -> dict[str, int]:
        seconds = words / SPEECH_WORDS_PER_SECOND
        return {"input_token": round(words * 1.6), "output_token": round(seconds * GEMINI_AUDIO_TOKENS_PER_SECOND)}


class GeminiBatchTTSProvider(_GeminiPricing):
    """Batch API only, like the script provider: there is no synchronous method."""

    name = "google-gemini"
    _DONE_OK = {"JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"}
    _DONE_BAD = {"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"}

    def __init__(self, api_key: str, model: str = "gemini-3.8-flash-tts"):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def submit(self, requests: list[TTSRequest], display_name: str) -> str:
        inlined: list[dict[str, Any]] = [{
            "contents": [{"role": "user", "parts": [{"text": r.text}]}],
            "metadata": {"key": r.key},
            "config": {
                "response_modalities": ["AUDIO"],
                "max_output_tokens": r.max_output_tokens,
                "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": r.voice}}},
            },
        } for r in requests]
        return self.client.batches.create(model=self.model, src=inlined, config={"display_name": display_name}).name

    def poll(self, batch_id: str) -> TTSBatchPoll:
        job = self.client.batches.get(name=batch_id)
        state = job.state.name if hasattr(job.state, "name") else str(job.state)
        if state in self._DONE_BAD:
            return TTSBatchPoll("failed", error=f"{state}: {job.error}")
        if state not in self._DONE_OK:
            return TTSBatchPoll("running")
        results = []
        for item in (job.dest.inlined_responses if job.dest else None) or []:
            key = (item.metadata or {}).get("key", "")
            response = item.response
            if item.error is not None or response is None or not response.candidates:
                results.append(TTSResult(key, None, None, str(item.error or "no audio returned")))
                continue
            usage = response.usage_metadata
            units = dict(input_tokens=(usage.prompt_token_count or 0) if usage else 0,
                         output_tokens=(usage.candidates_token_count or 0) if usage else 0)
            candidate = response.candidates[0]
            finish = getattr(candidate.finish_reason, "name", str(candidate.finish_reason or ""))
            part = next((p for p in (candidate.content.parts if candidate.content else []) if p.inline_data), None)
            if part is None or finish == "MAX_TOKENS":
                # A cut-off recording is worse than none: report it (and its cost) as failed.
                results.append(TTSResult(key, None, None, f"incomplete audio ({finish or 'no audio part'})", **units))
                continue
            results.append(TTSResult(key, part.inline_data.data, part.inline_data.mime_type, None, **units))
        return TTSBatchPoll("succeeded", results)

    def find_batch(self, display_name: str) -> str | None:
        for job in self.client.batches.list(config={"page_size": 100}):
            if job.display_name == display_name:
                return job.name
        return None


def _silent_wav(seconds: float, rate: int = 24000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack("<h", 0) * int(seconds * rate))
    return buffer.getvalue()


class FakeBatchTTSProvider(_GeminiPricing):
    """Gemini-shaped and batch-only, offline: silent WAVs, simulated token counts."""

    name = "fake-gemini-tts"

    def __init__(self, model: str = "gemini-3.8-flash-tts"):
        self.model = model
        self.batches: dict[str, tuple[str, list[TTSRequest]]] = {}
        self.submitted: list[TTSRequest] = []

    def submit(self, requests: list[TTSRequest], display_name: str) -> str:
        batch_id = f"batches/fake-tts-{uuid.uuid4().hex[:12]}"
        self.batches[batch_id] = (display_name, list(requests))
        self.submitted.extend(requests)
        return batch_id

    def poll(self, batch_id: str) -> TTSBatchPoll:
        _, requests = self.batches[batch_id]
        results = []
        for r in requests:
            seconds = max(1.0, len(r.text) * FAKE_SECONDS_PER_CHAR)
            results.append(TTSResult(r.key, _silent_wav(seconds), "audio/wav", None,
                                     input_tokens=len(r.text) // 4 + 1,
                                     output_tokens=round(seconds * GEMINI_AUDIO_TOKENS_PER_SECOND)))
        return TTSBatchPoll("succeeded", results)

    def find_batch(self, display_name: str) -> str | None:
        return next((b for b, (name, _) in self.batches.items() if name == display_name), None)
