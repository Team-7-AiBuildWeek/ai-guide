/**
 * Narration for one stop.
 *
 * Synthesis is slow (about eight seconds) and billed per call, while a walker
 * will happily replay the same stop three times — so results are cached in
 * memory, keyed by exactly what determines the audio, and kept for good in
 * R2: the same words in the same voice are paid for once, ever, and a saved
 * tour plays back from storage. The client prefetches ahead, so in practice
 * nothing is waited for twice.
 */

import { after } from "next/server";
import { getTTS } from "@/lib/providers/factory";
import { normaliseLang } from "@/lib/i18n/languages";
import { RateLimited, rateLimitedResponse, spend } from "@/lib/rateLimit";
import { r2Get, r2Put } from "@/lib/storage/r2";
import { voiceKey, voiceObject } from "@/lib/tour/voiceKey";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Entry = { body: ArrayBuffer; mimeType: string };

/**
 * Module scope, so it survives between requests on a warm server. Bounded,
 * because these are hundreds of kilobytes each — a server left running would
 * otherwise hold every stop it ever spoke.
 */
const CACHE = new Map<string, Entry>();
const MAX_ENTRIES = 60;

/** Longest text synthesised in one call: about 600 words. */
const MAX_TEXT_CHARS = 4000;

function remember(key: string, entry: Entry) {
  CACHE.set(key, entry);
  while (CACHE.size > MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

export async function POST(request: Request) {
  let body: { text?: string; lang?: string; voice?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });
  // The longest piece the narration is ever cut into is a few hundred words
  // (lib/audio/chunk.ts). Anything far longer is not a stop being read out.
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json({ error: "That is too long to say in one go." }, { status: 413 });
  }

  // Normalised before the cache key is built, so "en-GB" and "en" are one entry.
  const lang = normaliseLang(body.lang);
  /**
   * No default voice here.
   *
   * This route used to fill one in from `config.geminiVoice`, so every stop
   * asked ElevenLabs to speak as "Charon" — a Gemini voice — and got a 404
   * back. Which voice is a sensible default is the provider's business, and
   * each of them already knows its own.
   */
  const voice = body.voice;
  const key = voiceKey(text, lang, voice);

  const hit = CACHE.get(key);
  if (hit) {
    return new Response(hit.body, {
      headers: {
        "content-type": hit.mimeType,
        "content-length": String(hit.body.byteLength),
        "x-audio-cache": "hit",
        "cache-control": "no-store",
      },
    });
  }

  const kept = await r2Get(voiceObject(key));
  if (kept) {
    remember(key, kept);
    return new Response(kept.body, {
      headers: {
        "content-type": kept.mimeType,
        "content-length": String(kept.body.byteLength),
        "x-audio-cache": "stored",
        "cache-control": "no-store",
      },
    });
  }

  try {
    // Only now, on a miss everywhere: this is the call that costs money.
    await spend(request.headers, "audio");
    const tts = getTTS();
    const started = Date.now();
    const audio = await tts.synthesize(text, { lang, voice });
    remember(key, { body: audio, mimeType: tts.mimeType });
    after(() => r2Put(voiceObject(key), audio, tts.mimeType));

    return new Response(audio, {
      headers: {
        "content-type": tts.mimeType,
        "content-length": String(audio.byteLength),
        "x-audio-cache": "miss",
        "x-audio-ms": String(Date.now() - started),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof RateLimited) return rateLimitedResponse(err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Synthesis failed." },
      { status: 502 },
    );
  }
}
