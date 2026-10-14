/**
 * Kokoro's default voice for each language it speaks, and so the languages
 * it speaks at all. Its own module, with no config or fetch in it, so client
 * code (the developer cost estimate) and lib/config.ts (the cache key) can
 * read it too.
 *
 * Each one is the voice chosen for that language; KOKORO_VOICES overrides
 * them one language at a time, after an audition at /dev/tts. Changing one
 * here changes the audio cache key, so stops already recorded in the old
 * voice are recorded again.
 */
export const KOKORO_DEFAULT_VOICES: Readonly<Record<string, string>> = {
  // American, but Kokoro's warmest and best-rated voice; chosen over the British bf_emma.
  en: "af_heart",
  es: "ef_dora",
  fr: "ff_siwis",
  it: "if_sara",
  pt: "pf_dora",
  ja: "jf_alpha",
  zh: "zf_xiaobei",
};

export const KOKORO_LANGS: readonly string[] = Object.keys(KOKORO_DEFAULT_VOICES);
