/** OpenAI text-to-speech, over plain fetch. */

import { config, requireKey } from "@/lib/config";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { applyLexicon } from "./lexicon";

const ENDPOINT = "https://api.openai.com/v1/audio/speech";

/** Every voice is multilingual, so none of them is tied to a language. */
const VOICES: Voice[] = [
  { id: "alloy", name: "Alloy", langs: LANGUAGE_CODES, gender: "neutral" },
  { id: "echo", name: "Echo", langs: LANGUAGE_CODES, gender: "male" },
  { id: "fable", name: "Fable", langs: LANGUAGE_CODES, gender: "neutral" },
  { id: "onyx", name: "Onyx", langs: LANGUAGE_CODES, gender: "male" },
  { id: "nova", name: "Nova", langs: LANGUAGE_CODES, gender: "female" },
  { id: "shimmer", name: "Shimmer", langs: LANGUAGE_CODES, gender: "female" },
];

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";
  readonly mimeType = "audio/mpeg";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.openaiApiKey, "OPENAI_API_KEY", "openai");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL ?? "tts-1",
        voice: opts.voice ?? "onyx",
        input: applyLexicon(text),
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    return res.arrayBuffer();
  }

  async listVoices(): Promise<Voice[]> {
    // Fixed set — there is no voices endpoint.
    return VOICES;
  }
}
