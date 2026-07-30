/**
 * The languages a walk can be given in.
 *
 * One table, because the language is chosen once and then needed in four
 * unrelated places — the itinerary prompt, the narration prompt, the TTS voice,
 * and the browser's speech fallback. Each of those used to carry its own
 * `lang === "sk" ? … : …`, so a third language meant finding all four and a
 * missed one silently spoke English.
 *
 * To add a language, append a row. Nothing else needs to know.
 *
 * Every row here is on Google's documented list for both Gemini TTS and Google
 * Cloud TTS, so a walk in any of them gets a real voice rather than an English
 * one reading foreign words.
 */

export type Language = {
  /** What the draft stores and every request carries. */
  code: string;
  /** Its name for itself — what the picker shows, so it reads to the walker. */
  endonym: string;
  /** Its English name — what a model is told to write in. */
  english: string;
  /** BCP-47, for Google Cloud TTS and the browser's speech synthesis. */
  locale: string;
  /**
   * Google Cloud TTS names a few languages by their macrolanguage rather than
   * by BCP-47 — Mandarin is `cmn-CN` there, not `zh-CN`. Set only when it
   * differs from `locale`.
   */
  cloudLocale?: string;
};

/**
 * Ordered by who is likely to be standing in a European old town: the local
 * languages first, then the rest of Europe, then the long-haul visitors.
 */
export const LANGUAGES: Language[] = [
  { code: "en", endonym: "English", english: "English", locale: "en-GB" },
  { code: "sk", endonym: "Slovenčina", english: "Slovak", locale: "sk-SK" },
  { code: "cs", endonym: "Čeština", english: "Czech", locale: "cs-CZ" },
  { code: "de", endonym: "Deutsch", english: "German", locale: "de-DE" },
  { code: "pl", endonym: "Polski", english: "Polish", locale: "pl-PL" },
  { code: "hu", endonym: "Magyar", english: "Hungarian", locale: "hu-HU" },
  { code: "fr", endonym: "Français", english: "French", locale: "fr-FR" },
  { code: "es", endonym: "Español", english: "Spanish", locale: "es-ES" },
  { code: "it", endonym: "Italiano", english: "Italian", locale: "it-IT" },
  { code: "pt", endonym: "Português", english: "Portuguese", locale: "pt-PT" },
  { code: "nl", endonym: "Nederlands", english: "Dutch", locale: "nl-NL" },
  { code: "uk", endonym: "Українська", english: "Ukrainian", locale: "uk-UA" },
  { code: "tr", endonym: "Türkçe", english: "Turkish", locale: "tr-TR" },
  { code: "ru", endonym: "Русский", english: "Russian", locale: "ru-RU" },
  { code: "ja", endonym: "日本語", english: "Japanese", locale: "ja-JP" },
  { code: "ko", endonym: "한국어", english: "Korean", locale: "ko-KR" },
  { code: "zh", endonym: "中文", english: "Mandarin Chinese", locale: "zh-CN", cloudLocale: "cmn-CN" },
];

export const DEFAULT_LANG = "en";

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const FALLBACK = BY_CODE.get(DEFAULT_LANG)!;

/**
 * The row for a code, or null.
 *
 * Tolerates what arrives from a browser or a saved draft — "en-GB", "PT_br",
 * " de " all find their row, because the region is not something this app
 * distinguishes.
 */
export function findLanguage(code: string | null | undefined): Language | null {
  if (!code) return null;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return BY_CODE.get(base) ?? null;
}

/** A supported code, always. Anything unrecognised becomes English. */
export function normaliseLang(code: string | null | undefined): string {
  return (findLanguage(code) ?? FALLBACK).code;
}

/** What to call the language when telling a model to write in it. */
export function languageName(code: string | null | undefined): string {
  return (findLanguage(code) ?? FALLBACK).english;
}

/** BCP-47, for the browser's SpeechSynthesis. */
export function speechLocale(code: string | null | undefined): string {
  return (findLanguage(code) ?? FALLBACK).locale;
}

/** The language code Google Cloud TTS expects. */
export function ttsLocale(code: string | null | undefined): string {
  const lang = findLanguage(code) ?? FALLBACK;
  return lang.cloudLocale ?? lang.locale;
}

/**
 * What to ask a geocoder to label results in: the walker's language, with
 * English behind it, because a small town in Slovakia has no Japanese name and
 * an empty label is worse than an English one.
 */
export function geocodeLanguages(code: string | null | undefined): string {
  const lang = normaliseLang(code);
  return lang === DEFAULT_LANG ? DEFAULT_LANG : `${lang},${DEFAULT_LANG}`;
}

/** Every locale prefix worth keeping when listing a vendor's voices. */
export const VOICE_LOCALE_PREFIXES: string[] = LANGUAGES.map(
  (l) => (l.cloudLocale ?? l.locale).split("-")[0],
);

/** Every code, for providers whose model covers all of them equally. */
export const LANGUAGE_CODES: string[] = LANGUAGES.map((l) => l.code);
