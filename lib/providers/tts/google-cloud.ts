/**
 * Google *Cloud* Text-to-Speech — a different service from Gemini TTS.
 *
 * Kept because it is the only implementation here that takes SSML, so it gets
 * real IPA phonemes rather than respelled approximations. That matters for
 * Slovak place names. Reach for it with TTS_PROVIDER=google-cloud.
 */

import { config, requireKey } from "@/lib/config";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { toSSML } from "./lexicon";

const SYNTH = "https://texttospeech.googleapis.com/v1/text:synthesize";
const LIST = "https://texttospeech.googleapis.com/v1/voices";

type SynthResponse = { audioContent: string };
type VoicesResponse = {
  voices: Array<{ name: string; languageCodes: string[]; ssmlGender: string }>;
};

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = Buffer.from(b64, "base64");
  // Copy into a plain ArrayBuffer — Node Buffers share a pooled one.
  const out = new ArrayBuffer(bin.byteLength);
  new Uint8Array(out).set(bin);
  return out;
}

export class GoogleCloudTTSProvider implements TTSProvider {
  readonly name = "google-cloud";
  readonly mimeType = "audio/mpeg";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.googleCloudApiKey, "GOOGLE_API_KEY", "google-cloud");
    const languageCode = opts.lang === "sk" ? "sk-SK" : "en-GB";

    const res = await fetch(SYNTH, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        input: { ssml: toSSML(text) },
        voice: { languageCode, ...(opts.voice ? { name: opts.voice } : {}) },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as SynthResponse;
    return base64ToArrayBuffer(body.audioContent);
  }

  async listVoices(): Promise<Voice[]> {
    const apiKey = requireKey(config.googleCloudApiKey, "GOOGLE_API_KEY", "google-cloud");
    const res = await fetch(LIST, { headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as VoicesResponse;
    return body.voices
      .filter((v) => v.languageCodes.some((c) => c.startsWith("sk") || c.startsWith("en")))
      .map((v) => ({
        id: v.name,
        name: v.name,
        langs: v.languageCodes,
        gender:
          v.ssmlGender === "MALE" ? "male" : v.ssmlGender === "FEMALE" ? "female" : "neutral",
      }));
  }
}
