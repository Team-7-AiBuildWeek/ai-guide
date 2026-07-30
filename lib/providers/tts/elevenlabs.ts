/** ElevenLabs text-to-speech, over plain fetch. */

import { config, requireKey } from "@/lib/config";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { applyLexicon } from "./lexicon";

const BASE = "https://api.elevenlabs.io/v1";
/** ElevenLabs' "Rachel" — a safe default until we pick a voice properly. */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

type VoicesResponse = {
  voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
};

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";
  readonly mimeType = "audio/mpeg";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.elevenlabsApiKey, "ELEVENLABS_API_KEY", "elevenlabs");
    const voiceId = opts.voice ?? DEFAULT_VOICE;

    const res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "audio/mpeg",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        // Plain-text respelling: this endpoint does not take SSML.
        text: applyLexicon(text),
        model_id: "eleven_multilingual_v2",
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
      // The multilingual model covers every language the app offers.
      langs: LANGUAGE_CODES,
    }));
  }
}
