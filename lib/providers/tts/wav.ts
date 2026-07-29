/**
 * WAV container writing.
 *
 * Gemini returns raw PCM with no container at all — no RIFF header, nothing.
 * Handed straight to an `<audio>` element it plays as silence, or not at all,
 * with no error to explain why. Every byte of audio from that provider has to
 * come through here first.
 */

export type PcmFormat = {
  sampleRate: number;
  /** Bits per sample. */
  bitDepth: number;
  channels: number;
};

/** What Gemini TTS emits: 24 kHz, 16-bit, mono. */
export const GEMINI_PCM: PcmFormat = { sampleRate: 24000, bitDepth: 16, channels: 1 };

/** Wrap raw little-endian PCM in the 44-byte canonical WAV header. */
export function pcmToWav(pcm: Uint8Array, fmt: PcmFormat): ArrayBuffer {
  const { sampleRate, bitDepth, channels } = fmt;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const out = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(out);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true); // file size minus the first 8 bytes
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  new Uint8Array(out, 44).set(pcm);
  return out;
}

/** Seconds of audio in a raw PCM buffer — useful for logs and the test page. */
export function pcmDuration(byteLength: number, fmt: PcmFormat): number {
  return byteLength / (fmt.sampleRate * fmt.channels * (fmt.bitDepth / 8));
}

/** A plain tone, used by the mock so the player can be built with no key. */
export function toneWav(seconds: number, freq: number, sampleRate = 8000): ArrayBuffer {
  const frames = Math.floor(sampleRate * seconds);
  const pcm = new Uint8Array(frames * 2);
  const view = new DataView(pcm.buffer);
  const fade = Math.min(frames / 2, sampleRate * 0.05);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.min(1, i / fade, (frames - i) / fade);
    // Quiet on purpose — this gets tested with earbuds in.
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.18 * envelope;
    view.setInt16(i * 2, sample * 0x7fff, true);
  }
  return pcmToWav(pcm, { sampleRate, bitDepth: 16, channels: 1 });
}
