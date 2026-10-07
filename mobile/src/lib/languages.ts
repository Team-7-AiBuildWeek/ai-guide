/** The narration languages the website offers (lib/i18n/languages.ts). */

export type Language = { code: string; endonym: string; english: string; locale: string };

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
  { code: "zh", endonym: "中文", english: "Mandarin Chinese", locale: "zh-CN" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function normaliseLang(code: string | null | undefined): string {
  const base = (code ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return BY_CODE.has(base) ? base : "en";
}

export function languageName(code: string | null | undefined): string {
  return BY_CODE.get(normaliseLang(code))!.english;
}

export function speechLocale(code: string | null | undefined): string {
  return BY_CODE.get(normaliseLang(code))!.locale;
}

export function languageLabel(l: Language): string {
  return l.endonym === l.english ? l.endonym : `${l.endonym} — ${l.english}`;
}
