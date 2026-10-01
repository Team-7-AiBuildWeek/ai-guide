"""Content identity. Same inputs -> same hash -> the unique index refuses a second row.

Everything that changes what the listener hears is in a hash; nothing else is. In
particular the LLM model is not part of a script's identity: switching models is a
deliberate SCRIPT_VERSION bump, not something that silently invalidates the cache.
"""

import hashlib
import json
from collections.abc import Iterable
from typing import Any


def stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def facts_hash(fact_content_hashes: Iterable[str]) -> str:
    return stable_hash(sorted(fact_content_hashes))


def script_hash(*, poi_id: int, language: str, persona: str, depth_level: str,
                script_version: int, facts_hash: str) -> str:
    return stable_hash({
        "kind": "script", "poi_id": poi_id, "language": language, "persona": persona,
        "depth_level": depth_level, "script_version": script_version, "facts_hash": facts_hash,
    })


def audio_hash(*, script_input_hash: str, script_text: str, tts_provider: str, tts_model: str,
               voice_id: str, lexicon_hash: str) -> str:
    return stable_hash({
        "kind": "audio", "script": script_input_hash, "text": content_hash(script_text),
        "tts_provider": tts_provider, "tts_model": tts_model, "voice_id": voice_id,
        "lexicon": lexicon_hash,
    })
