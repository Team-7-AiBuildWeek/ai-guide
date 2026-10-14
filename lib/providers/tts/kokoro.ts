/**
 * Kokoro-82M text-to-speech, hosted by DeepInfra, over plain fetch.
 *
 * Kokoro speaks only some of the app's languages, so on its own it is only
 * useful for those; `kokoro+google` (./routed.ts) sends the rest to Gemini.
 *
 * Kokoro takes no language parameter. The language comes from the first
 * letter of the voice id — `e` Spanish, `p` Portuguese, `j` Japanese — so a
 * voice from the wrong row reads Slovak with Spanish phonetics and reports no
 * error. Every voice used here is checked against the language it is for.
 *
 * Measured (2026-10-14, priority tier): a 55-word opening in ~2 s; a full
 * 3,600-character stop as one 3½-minute recording in ~51 s. The output is a
 * 24 kHz 16-bit mono WAV — the same as Gemini's after `pcmToWav` — so the two
 * can serve one route under one MIME type.
 */

import { config, requireKey } from "@/lib/config";
import { ProviderError, type Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { applyLexicon } from "./lexicon";

const ENDPOINT = "https://api.deepinfra.com/v1/openai/audio/speech";

/** Kokoro's v1.0 voices for the languages this app offers. Hindi is left out. */
const VOICES: Voice[] = [
  // en-GB is the app's English locale, so the British voices come first.
  ...["bf_emma", "bf_isabella", "bf_alice", "bf_lily"].map((id) => voice(id, "en", "female")),
  ...["bm_george", "bm_fable", "bm_daniel", "bm_lewis"].map((id) => voice(id, "en", "male")),
  ...["af_heart", "af_bella", "af_nicole", "af_sarah", "af_nova", "af_sky"].map((id) => voice(id, "en", "female")),
  ...["am_michael", "am_fenrir", "am_puck", "am_adam", "am_eric", "am_liam"].map((id) => voice(id, "en", "male")),
  voice("ef_dora", "es", "female"),
  voice("em_alex", "es", "male"),
  voice("ff_siwis", "fr", "female"),
  voice("if_sara", "it", "female"),
  voice("im_nicola", "it", "male"),
  // Brazilian voices: Kokoro has no European Portuguese.
  voice("pf_dora", "pt", "female"),
  voice("pm_alex", "pt", "male"),
  ...["jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro"].map((id) => voice(id, "ja", "female")),
  voice("jm_kumo", "ja", "male"),
  ...["zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi"].map((id) => voice(id, "zh", "female")),
  ...["zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang"].map((id) => voice(id, "zh", "male")),
];

function voice(id: string, lang: string, gender: Voice["gender"]): Voice {
  return { id, name: `${id} (${lang})`, langs: [lang], gender };
}

/**
 * The voice a language gets when none is asked for. Each one is the
 * best-rated voice Kokoro has in that language; KOKORO_VOICES overrides them
 * one language at a time, after an audition at /dev/tts.
 */
const DEFAULT_VOICES: Record<string, string> = {
  en: "bf_emma",
  es: "ef_dora",
  fr: "ff_siwis",
  it: "if_sara",
  pt: "pf_dora",
  ja: "jf_alpha",
  zh: "zf_xiaobei",
};

/** The languages Kokoro can speak at all. */
export const KOKORO_LANGS: string[] = Object.keys(DEFAULT_VOICES);

/** `KOKORO_VOICES="en=bm_george,pt=pm_alex"`, checked against the voice list. */
function voiceOverrides(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of config.kokoroVoices.split(",")) {
    const [lang, id] = pair.split("=").map((s) => s.trim());
    if (lang && id && VOICES.some((v) => v.id === id && v.langs.includes(lang))) out[lang] = id;
  }
  return out;
}

/** The voice for a language, as the voice list and the env var have it. */
export function kokoroVoiceFor(lang: string): string | undefined {
  return voiceOverrides()[lang] ?? DEFAULT_VOICES[lang];
}

export class KokoroTTSProvider implements TTSProvider {
  readonly name = "kokoro";
  readonly mimeType = "audio/wav";

  supports(lang: string): boolean {
    return KOKORO_LANGS.includes(lang);
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    const apiKey = requireKey(config.deepinfraApiKey, "DEEPINFRA_API_KEY", "kokoro");

    // A voice asked for by id is used only if it speaks this language: a voice
    // from another row (or another vendor's "Charon") would mispronounce
    // everything, or 404.
    const asked = VOICES.find((v) => v.id === opts.voice && v.langs.includes(opts.lang));
    const voiceId = asked?.id ?? kokoroVoiceFor(opts.lang);
    if (!voiceId) throw new ProviderError(this.name, `Kokoro has no voice for "${opts.lang}"`);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.kokoroModel,
        input: applyLexicon(text),
        voice: voiceId,
        response_format: "wav",
        speed: config.kokoroSpeed,
        // "priority" skips DeepInfra's queue (1.5–10 s when busy) at 1.5× the price.
        service_tier: config.kokoroServiceTier,
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const audio = await res.arrayBuffer();
    // An error page saved as narration would be kept in R2 for good.
    const head = new Uint8Array(audio, 0, Math.min(4, audio.byteLength));
    if (String.fromCharCode(...head) !== "RIFF") {
      throw new ProviderError(this.name, `expected a WAV, got ${res.headers.get("content-type") ?? "no content type"}`);
    }
    return audio;
  }

  async listVoices(): Promise<Voice[]> {
    // Fixed set — DeepInfra has no voices endpoint for Kokoro.
    return VOICES;
  }
}
