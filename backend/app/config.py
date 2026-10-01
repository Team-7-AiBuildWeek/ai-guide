"""Settings and the fixed v1 content dimensions.

Every persona x depth x language combination multiplies the number of segments to cache,
so the lists are deliberately short. Adding a value is a change here, not a migration.
"""

import os
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class Depth:
    words: int          # target script length in English words
    max_output_tokens: int  # hard ceiling for the draft, thinking included; bounds the budget reservation


PERSONAS: dict[str, str] = {
    "storyteller": "A warm storyteller who leads with people and anecdotes, then the facts that make them matter.",
    "historian": "A precise historian: dates, causes and consequences, clearly sourced, no embellishment.",
    "family": "A lively guide for families with children aged 8-12: concrete, playful, short sentences.",
}

DEPTHS: dict[str, Depth] = {
    "short": Depth(words=220, max_output_tokens=3072),   # ~90 s spoken
    "full": Depth(words=560, max_output_tokens=6144),    # ~4 min spoken
}

# Narration language -> TTS locale.
LANGUAGES: dict[str, str] = {"en": "en-US", "de": "de-DE", "sk": "sk-SK"}

# Themes only choose and order POIs; scripts never see them, which is what keeps
# segments shareable across users.
THEMES: dict[str, set[str]] = {
    "highlights": set(),  # empty = any tag
    "architecture": {"architecture", "church", "castle", "palace", "building", "bridge"},
    "history": {"history", "monument", "museum", "castle", "memorial", "church"},
    "art": {"art", "museum", "sculpture", "gallery", "theatre"},
    "food": {"market", "cafe", "restaurant", "food"},
}


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "postgresql+psycopg://walk@localhost:5432/walk"))

    # Object storage: Cloudflare R2 in production, MinIO locally. Both speak S3.
    # "local" writes to ./local-audio for laptop runs without Docker (file:// URLs, dev only).
    storage_backend: str = field(default_factory=lambda: _env("STORAGE_BACKEND", "s3"))
    # Local backend only: where this API is reachable from the browser, and the key
    # that signs its /files URLs.
    public_base_url: str = field(default_factory=lambda: _env("PUBLIC_BASE_URL", "http://localhost:8000"))
    local_url_secret: str = field(default_factory=lambda: _env("LOCAL_URL_SECRET", "dev-only-secret"))
    s3_endpoint_url: str | None = field(default_factory=lambda: _env("S3_ENDPOINT_URL"))
    s3_access_key_id: str | None = field(default_factory=lambda: _env("S3_ACCESS_KEY_ID"))
    s3_secret_access_key: str | None = field(default_factory=lambda: _env("S3_SECRET_ACCESS_KEY"))
    s3_bucket: str = field(default_factory=lambda: _env("S3_BUCKET", "walk-audio"))
    s3_region: str = field(default_factory=lambda: _env("S3_REGION", "auto"))
    # URL the app downloads from; differs from the endpoint when MinIO runs in Docker.
    s3_public_endpoint_url: str | None = field(default_factory=lambda: _env("S3_PUBLIC_ENDPOINT_URL"))
    signed_url_ttl_s: int = field(default_factory=lambda: int(_env("SIGNED_URL_TTL_S", str(24 * 3600))))

    # Providers: real ones by default; "fake" runs everything offline at zero cost.
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "gemini"))
    tts_provider: str = field(default_factory=lambda: _env("TTS_PROVIDER", "chirp"))
    routing_provider: str = field(default_factory=lambda: _env("ROUTING_PROVIDER", "ors"))

    gemini_api_key: str | None = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    ors_api_key: str | None = field(default_factory=lambda: _env("ORS_API_KEY"))
    # Service-account JSON for Cloud TTS, for hosts without a credentials file.
    # Otherwise GOOGLE_APPLICATION_CREDENTIALS is used, as usual.
    google_credentials_json: str | None = field(default_factory=lambda: _env("GOOGLE_CREDENTIALS_JSON"))

    # Prose and fact-checking. 3.6 Flash is now "previous generation" at the same price.
    script_model: str = field(default_factory=lambda: _env("SCRIPT_MODEL", "gemini-3.8-flash"))
    # Mechanical work: translation.
    mechanical_model: str = field(default_factory=lambda: _env("MECHANICAL_MODEL", "gemini-3.5-flash-lite"))
    # Bump to regenerate every script (new prompt, new model). Old segments are served as
    # stale until pre-warming replaces them.
    script_version: int = field(default_factory=lambda: int(_env("SCRIPT_VERSION", "1")))

    tts_model: str = field(default_factory=lambda: _env("TTS_MODEL", "chirp3-hd"))
    voice_name: str = field(default_factory=lambda: _env("VOICE_NAME", "Charon"))

    # Hard caps for on-demand generation (POST /tours). Prewarm takes its cap on the CLI.
    request_budget_usd: Decimal = field(default_factory=lambda: Decimal(_env("REQUEST_BUDGET_USD", "3.00")))
    daily_budget_usd: Decimal = field(default_factory=lambda: Decimal(_env("DAILY_BUDGET_USD", "20.00")))

    admin_token: str | None = field(default_factory=lambda: _env("ADMIN_TOKEN"))
    # Shared with the web app; required by POST /internal/worker/tick. On Vercel this
    # is the project's CRON_SECRET, which Vercel Cron also sends.
    worker_secret: str | None = field(default_factory=lambda: _env("WORKER_SECRET", _env("CRON_SECRET")))
    # Run pending migrations when the API starts (serverless deploys have no other hook).
    migrate_on_start: bool = field(default_factory=lambda: _env("MIGRATE_ON_START", "false").lower() == "true")
    walking_speed_m_s: float = 1.2

    def voice_id(self, language: str) -> str:
        """Chirp 3: HD voice names are <locale>-Chirp3-HD-<voice>."""
        return f"{LANGUAGES[language]}-Chirp3-HD-{self.voice_name}"


def get_settings() -> Settings:
    return Settings()
