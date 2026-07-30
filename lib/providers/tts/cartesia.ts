/**
 * Cartesia text-to-speech, over plain fetch.
 *
 * MP3 straight from the vendor, so like ElevenLabs and unlike Gemini there is
 * no container to build here.
 *
 * The difference from every other provider in this folder: Cartesia is *told*
 * the language rather than inferring it from the text. That is a better deal
 * than it sounds — a Slovak place name in an English sentence no longer risks
 * pulling the whole line into Slovak — and it covers all seventeen languages
 * the app offers, so the code passes ours straight through.
 *
 * Everything is keyed and kept on disk, and calls in flight are shared. Both
 * for the same reason as ElevenLabs: this is billed per character, and a
 * walker replaying a stop should not pay for it twice.
 */

import { config, requireKey } from "@/lib/config";
import { LANGUAGE_CODES, normaliseLang } from "@/lib/i18n/languages";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { audioKey, readCached, writeCached } from "./audioCache";
import { applyLexicon } from "./lexicon";

const BASE = "https://api.cartesia.ai";

/**
 * The API is versioned by date in a header, and it is not optional. Pin it:
 * a request without one is refused, and a request with a newer one than the
 * code was written against is how a response shape changes underneath you.
 */
const API_VERSION = "2026-03-01";

/** 44.1kHz at 128kbps — past what a walker with one earbud in can hear. */
const OUTPUT_FORMAT = { container: "mp3", sample_rate: 44100, bit_rate: 128000 } as const;

type VoicesResponse = {
  data?: Array<{ id: string; name: string; language?: string; gender?: string }>;
};

/** Same clip asked for twice at once is one request, not two. */
const inFlight = new Map<string, Promise<ArrayBuffer>>();

function gender(value: string | undefined): Voice["gender"] {
  if (value === "masculine") return "male";
  if (value === "feminine") return "female";
  return "neutral";
}

export class CartesiaTTSProvider implements TTSProvider {
  readonly name = "cartesia";
  readonly mimeType = "audio/mpeg";

  private headers(apiKey: string): Record<string, string> {
    return {
      authorization: `Bearer ${apiKey}`,
      "Cartesia-Version": API_VERSION,
      "content-type": "application/json",
    };
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.cartesiaApiKey, "CARTESIA_API_KEY", "cartesia");
    const voiceId = opts.voice ?? config.cartesiaVoice;
    const model = config.cartesiaModel;
    const language = normaliseLang(opts.lang);

    // Plain-text respelling: no SSML here either, so the lexicon rewrites the
    // words themselves — before the key is made, so what is cached is what was
    // actually spoken.
    const spoken = applyLexicon(text);
    // The language is part of the key because it is part of the request: the
    // same sentence read as Slovak and as English are two different clips.
    const key = audioKey(`${language} ${spoken}`, voiceId, model);

    const cached = await readCached(key);
    if (cached) return cached;

    const running = inFlight.get(key);
    if (running) return running;

    const job = this.fetchAudio(apiKey, voiceId, model, language, spoken)
      .then(async (audio) => {
        await writeCached(key, audio);
        return audio;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, job);
    return job;
  }

  private async fetchAudio(
    apiKey: string,
    voiceId: string,
    model: string,
    language: string,
    spoken: string,
  ): Promise<ArrayBuffer> {
    const res = await fetch(`${BASE}/tts/bytes`, {
      method: "POST",
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model_id: model,
        transcript: spoken,
        voice: { mode: "id", id: voiceId },
        language,
        output_format: OUTPUT_FORMAT,
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    return res.arrayBuffer();
  }

  async listVoices(): Promise<Voice[]> {
    const apiKey = requireKey(config.cartesiaApiKey, "CARTESIA_API_KEY", "cartesia");
    const res = await fetch(`${BASE}/voices`, { headers: this.headers(apiKey) });
    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as VoicesResponse;
    // Paginated, and the first page is plenty for a picker — nobody auditions
    // past the first hundred.
    return (body.data ?? []).map((v) => ({
      id: v.id,
      name: v.language && v.language !== "en" ? `${v.name} (${v.language})` : v.name,
      // A voice is tied to the language it was recorded in, but the model
      // speaks all of them, so any voice can read any walk.
      langs: LANGUAGE_CODES,
      gender: gender(v.gender),
    }));
  }
}
