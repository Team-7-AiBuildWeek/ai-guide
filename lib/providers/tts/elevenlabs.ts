/**
 * ElevenLabs text-to-speech, over plain fetch.
 *
 * MP3 straight from the vendor, which is what an <audio> element wants — there
 * is no container to build here the way Gemini's raw PCM needs one.
 *
 * Two things it does that the other providers do not:
 *  - Everything is keyed and kept on disk, because this is billed per
 *    character and a walker replaying a stop should not be charged for it
 *    twice. See `audioCache`.
 *  - Calls in flight are shared. Two prefetches of the same stop arriving a
 *    few milliseconds apart used to be two invoices for one clip.
 */

import { config, requireKey } from "@/lib/config";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { audioKey, readCached, writeCached } from "./audioCache";
import { applyLexicon } from "./lexicon";

const BASE = "https://api.elevenlabs.io/v1";

/**
 * 44.1kHz at 128kbps: the highest MP3 the free tier serves, and the point past
 * which nobody walking down a street with one earbud in can hear a difference.
 */
const OUTPUT_FORMAT = "mp3_44100_128";

type VoicesResponse = {
  voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
};

/** Same clip asked for twice at once is one request, not two. */
const inFlight = new Map<string, Promise<ArrayBuffer>>();

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";
  readonly mimeType = "audio/mpeg";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.elevenlabsApiKey, "ELEVENLABS_API_KEY", "elevenlabs");
    const voiceId = opts.voice ?? config.elevenlabsVoice;
    const model = config.elevenlabsModel;

    // Plain-text respelling: this endpoint takes no SSML, so the lexicon
    // rewrites the words themselves — and it happens before the key is made,
    // so what is cached is what was actually spoken.
    const spoken = applyLexicon(text);
    const key = audioKey(spoken, voiceId, model);

    const cached = await readCached(key);
    if (cached) return cached;

    const running = inFlight.get(key);
    if (running) return running;

    const job = this.fetchAudio(apiKey, voiceId, model, spoken)
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
    spoken: string,
  ): Promise<ArrayBuffer> {
    const url = `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "audio/mpeg",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: spoken,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    return res.arrayBuffer();
  }

  async listVoices(): Promise<Voice[]> {
    const apiKey = requireKey(config.elevenlabsApiKey, "ELEVENLABS_API_KEY", "elevenlabs");
    const res = await fetch(`${BASE}/voices`, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as VoicesResponse;
    return body.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      // Both models are multilingual, so every voice covers every language the
      // app offers.
      langs: LANGUAGE_CODES,
    }));
  }
}
