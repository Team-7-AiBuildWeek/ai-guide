import type { Voice } from "@/lib/providers/types";

export type SynthesizeOptions = {
  /** BCP-47, e.g. "sk" or "en". */
  lang: string;
  voice?: string;
};

export interface TTSProvider {
  readonly name: string;
  /** Audio bytes, format depends on the vendor (mp3 for most, wav for mock). */
  synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer>;
  listVoices(): Promise<Voice[]>;
  /** MIME type of what `synthesize` returns, so callers can serve it correctly. */
  readonly mimeType: string;
}
