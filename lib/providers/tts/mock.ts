/**
 * Mock TTS. No key, no network.
 *
 * Returns a real, playable WAV so the audio engine can be built and tested
 * before a cent is spent on synthesis: a soft tone, one pitch per stop so you
 * can hear when the player advances, and a length derived from the text at a
 * realistic speaking rate.
 */

import type { SynthesizeOptions, TTSProvider } from "./index";
import { applyLexicon } from "./lexicon";
import { toneWav } from "./wav";
import type { Voice } from "@/lib/providers/types";

const SAMPLE_RATE = 8000;
/** Roughly the speed of a measured narrator. */
const CHARS_PER_SECOND = 14;
/** A 3-minute mock is 3 minutes of waiting during development. Cap it. */
const MAX_SECONDS = 12;

const VOICES: Voice[] = [
  { id: "mock-sk", name: "Mock (Slovak)", langs: ["sk"], gender: "female" },
  { id: "mock-en", name: "Mock (English)", langs: ["en"], gender: "male" },
];

/** Stable pitch per text, so the same stop always sounds the same. */
function hashToPitch(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  const scale = [220, 247, 262, 294, 330, 349, 392]; // A3 upward
  return scale[Math.abs(h) % scale.length];
}

export class MockTTSProvider implements TTSProvider {
  readonly name = "mock";
  readonly mimeType = "audio/wav";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    // Run the lexicon even here — it keeps the substitution path exercised.
    const spoken = applyLexicon(text);
    const seconds = Math.min(MAX_SECONDS, Math.max(1, spoken.length / CHARS_PER_SECOND));
    const base = hashToPitch(spoken);
    return toneWav(seconds, opts.lang === "sk" ? base : base * 1.5, SAMPLE_RATE);
  }

  async listVoices(): Promise<Voice[]> {
    return VOICES;
  }
}
