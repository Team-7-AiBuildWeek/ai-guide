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

function makeWav(seconds: number, freq: number): ArrayBuffer {
  const frames = Math.floor(SAMPLE_RATE * seconds);
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, frames * 2, true);

  const fade = Math.min(frames / 2, SAMPLE_RATE * 0.05);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.min(1, i / fade, (frames - i) / fade);
    // Quiet on purpose — this gets tested with earbuds in.
    const sample = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.18 * envelope;
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }
  return buffer;
}

export class MockTTSProvider implements TTSProvider {
  readonly name = "mock";
  readonly mimeType = "audio/wav";

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    // Run the lexicon even here — it keeps the substitution path exercised.
    const spoken = applyLexicon(text);
    const seconds = Math.min(MAX_SECONDS, Math.max(1, spoken.length / CHARS_PER_SECOND));
    const base = hashToPitch(spoken);
    return makeWav(seconds, opts.lang === "sk" ? base : base * 1.5);
  }

  async listVoices(): Promise<Voice[]> {
    return VOICES;
  }
}
