/**
 * `kokoro+google`: Kokoro for the languages it speaks, Gemini for the rest.
 *
 * Kokoro is a fraction of Gemini's price and answers in seconds, but it has no
 * voice at all for Slovak, Czech, German and most of the others. Both return
 * 24 kHz mono WAV, so callers see one provider with one MIME type.
 *
 * If DeepInfra fails, the stop is read by Gemini rather than not at all. That
 * recording is cached like any other, so a Kokoro language can end up with
 * the odd Gemini stop until the cache entry is cleared.
 */

import type { Voice } from "@/lib/providers/types";
import type { SynthesizeOptions, TTSProvider } from "./index";
import { GoogleTTSProvider } from "./google";
import { KOKORO_LANGS, KokoroTTSProvider } from "./kokoro";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";

export class KokoroGoogleTTSProvider implements TTSProvider {
  readonly name = "kokoro+google";
  readonly mimeType = "audio/wav";

  private readonly kokoro = new KokoroTTSProvider();
  private readonly google = new GoogleTTSProvider();

  /** Which vendor reads this language. For diagnostics. */
  speakerFor(lang: string): string {
    return this.kokoro.supports(lang) ? this.kokoro.name : this.google.name;
  }

  async synthesize(text: string, opts: SynthesizeOptions): Promise<ArrayBuffer> {
    if (!this.kokoro.supports(opts.lang)) {
      return this.google.synthesize(text, opts);
    }
    try {
      return await this.kokoro.synthesize(text, opts);
    } catch (err) {
      console.warn(`[tts] Kokoro failed for "${opts.lang}", reading with Gemini instead:`, err);
      // The voice asked for was a Kokoro id; Gemini picks its own.
      return this.google.synthesize(text, { lang: opts.lang });
    }
  }

  async listVoices(): Promise<Voice[]> {
    const others = LANGUAGE_CODES.filter((l) => !KOKORO_LANGS.includes(l));
    const gemini = (await this.google.listVoices()).map((v) => ({ ...v, langs: others }));
    return [...(await this.kokoro.listVoices()), ...gemini];
  }
}
