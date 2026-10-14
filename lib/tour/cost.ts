/**
 * What a tour costs to make, roughly — for the developer panel.
 *
 * An estimate, not a bill: Gemini 3.6 Flash for the writing (one call to choose
 * the stops, about a cent, and one per stop, just under), and the voice. The
 * voice depends on the language: with TTS_PROVIDER=kokoro+google, Kokoro reads
 * the languages it has (lib/providers/tts/kokoroLangs.ts) and Gemini the rest.
 * Google's listed prices double on 1 January 2027. Recordings already kept in
 * R2, and walk-backend's prepared tours, cost nothing, which this does not know.
 */

import type { Detail } from "@/lib/providers/types";
import { KOKORO_LANGS } from "@/lib/providers/tts/kokoroLangs";
import { SCRIPT_MINUTES } from "@/lib/tour/shape";

const PLAN_USD = 0.01;
const SCRIPT_USD_PER_STOP = 0.009;

/** Gemini speech: about $0.015 a minute of audio. */
const GEMINI_USD_PER_MINUTE = 0.015;
/**
 * Kokoro on DeepInfra is billed per character of text: $0.99 a million, ×1.5
 * on the priority tier the web app uses. A minute of script is written at 145
 * words of ~6 characters, so ~870 characters — about $0.0013. Reading slower
 * (KOKORO_SPEED) makes more audio from the same text, not a bigger bill.
 */
const KOKORO_USD_PER_MINUTE = (145 * 6 * 0.99 * 1.5) / 1_000_000;

export type VoiceName = "Kokoro" | "Gemini";

/** Which voice reads a language, given the server's TTS_PROVIDER. */
export function voiceFor(tts: string | null | undefined, lang: string | null | undefined): VoiceName {
  const kokoro = tts === "kokoro" || (tts === "kokoro+google" && KOKORO_LANGS.includes(lang ?? "en"));
  return kokoro ? "Kokoro" : "Gemini";
}

export function estimateTourCost(
  stops: number,
  detail: Detail = "story",
  voice: { tts?: string | null; lang?: string | null } = {},
) {
  const audioMinutes = stops * SCRIPT_MINUTES[detail];
  const writing = PLAN_USD + stops * SCRIPT_USD_PER_STOP;
  const voiceName = voiceFor(voice.tts, voice.lang);
  const perMinute = voiceName === "Kokoro" ? KOKORO_USD_PER_MINUTE : GEMINI_USD_PER_MINUTE;
  const voiceUsd = audioMinutes * perMinute;
  return { audioMinutes, writing, voice: voiceUsd, voiceName, total: writing + voiceUsd };
}

/** Dollars, with a third decimal for amounts under a cent so a cheap voice does not read as free. */
export const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
