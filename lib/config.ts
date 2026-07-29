/**
 * Every external service is selected here, by env var, and defaults to `mock`.
 *
 * The whole app must be clickable end to end with no API keys at all — that is
 * the point of this file. Nothing outside `lib/providers/` should read
 * `process.env` directly.
 */

export type LLMProviderName = "mock" | "anthropic" | "openai" | "google";
export type TTSProviderName = "mock" | "elevenlabs" | "openai" | "google" | "google-cloud";
export type MapProviderName = "mock" | "stadia" | "maptiler" | "mapbox" | "osm";

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = (value ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export const config = {
  llmProvider: pick<LLMProviderName>(
    process.env.LLM_PROVIDER,
    ["mock", "anthropic", "openai", "google"],
    "mock",
  ),
  ttsProvider: pick<TTSProviderName>(
    process.env.TTS_PROVIDER,
    ["mock", "elevenlabs", "openai", "google", "google-cloud"],
    "mock",
  ),
  mapProvider: pick<MapProviderName>(
    process.env.MAP_PROVIDER,
    ["mock", "stadia", "maptiler", "mapbox", "osm"],
    "mock",
  ),

  // Keys. Absent is fine — only the selected provider's key is ever read.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  /**
   * Gemini, via @google/genai. GEMINI_API_KEY is the name the SDK itself uses;
   * GOOGLE_API_KEY is accepted as a fallback so switching mid-setup doesn't
   * break. Server-side only — this must never reach a NEXT_PUBLIC_ variable.
   */
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  /** Google *Cloud* TTS is a separate service and often a separate key. */
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY ?? process.env.GOOGLE_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  stadiaApiKey: process.env.STADIA_API_KEY,
  maptilerApiKey: process.env.MAPTILER_API_KEY,
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  openrouteserviceApiKey: process.env.OPENROUTESERVICE_API_KEY,

  // Model ids, overridable so a new release doesn't need a code change.
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  geminiModel: process.env.GEMINI_MODEL ?? process.env.GOOGLE_MODEL ?? "gemini-3.6-flash",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts",
  /** Which prebuilt Gemini voice narrates the tour. Audition them at /dev/tts. */
  geminiVoice: process.env.GEMINI_VOICE ?? "Charon",

  /** Stadia serves an EU endpoint too — api-eu.stadiamaps.com, closer to Bratislava. */
  stadiaBaseUrl: process.env.STADIA_BASE_URL ?? "https://api.stadiamaps.com",
  /** alidade_smooth | alidade_smooth_dark | outdoors | osm_bright | stamen_toner | ... */
  stadiaStyle: process.env.STADIA_STYLE ?? "alidade_smooth",
  /**
   * Use Stadia's domain-based auth for tiles instead of putting the key in the
   * style URL. Requests are authorised by the browser's Origin/Referer, so the
   * key never reaches the page at all. Add the domain under Manage Properties
   * first, or every tile 401s.
   */
  stadiaDomainAuth: (process.env.STADIA_DOMAIN_AUTH ?? "").toLowerCase() === "true",

  /** Nominatim demands a contact address in the User-Agent. */
  nominatimUserAgent:
    process.env.NOMINATIM_USER_AGENT ?? "walk-bratislava-mvp (contact: set NOMINATIM_USER_AGENT)",
} as const;

/** Bratislava old town — the fallback map centre when GPS is refused. */
export const DEFAULT_CENTER = { lat: 48.1435, lng: 17.1073 };

export function requireKey(value: string | undefined, envName: string, provider: string): string {
  if (!value) {
    throw new Error(
      `${provider} provider selected but ${envName} is not set. ` +
        `Either set it, or leave the provider on "mock".`,
    );
  }
  return value;
}
