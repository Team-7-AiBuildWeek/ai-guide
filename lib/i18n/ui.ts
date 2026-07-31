"use client";

/**
 * The app's own words, as against the guide's.
 *
 * Two different languages hide behind one setting. The guide's language is
 * what the tour is written and spoken in, and it has always worked. This is
 * the other one: the buttons, the labels, the screen a walker reads *before*
 * any of that exists. Choosing Slovak and then being asked "What interests
 * you?" in English is the app not listening.
 *
 * One dictionary keyed by phrase id, and a lookup that falls back to English
 * for anything missing. Falling back rather than failing is the point: a
 * half-translated language shows the translated half, and the rest still
 * works.
 *
 * ADDING A LANGUAGE: copy the `en` block, translate the values, key it by the
 * code from `languages.ts`. Nothing else needs to know. Anything left out
 * falls back, so a partial contribution is worth having.
 */

import { useSyncExternalStore } from "react";
import { normaliseLang } from "./languages";
import { cs } from "./locales/cs";
import { de } from "./locales/de";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { hu } from "./locales/hu";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { nl } from "./locales/nl";
import { pl } from "./locales/pl";
import { pt } from "./locales/pt";
import { ru } from "./locales/ru";
import { sk } from "./locales/sk";
import { tr } from "./locales/tr";
import { uk } from "./locales/uk";
import { zh } from "./locales/zh";

const EN = {
  // ---------------------------------------------------------------- landing
  "landing.walkCity": "Walk {city}",
  "landing.walkAnywhere": "Walk any city",
  "landing.pitch": "A guide in your ear, built around what you actually want to see.",
  "landing.build": "Build my tour",
  "landing.chooseCity": "Choose any city",
  "landing.paused": "Your tour, paused",
  "landing.carryOn": "Carry on walking",
  "landing.different": "Build a different tour",
  "landing.stopOf": "Stop {n} of {total}",

  // ------------------------------------------------------------------ brief
  "brief.title": "Build my tour",
  "brief.language": "Language",
  "brief.howLong": "How long",
  "brief.detail": "How much detail",
  "brief.pace": "Pace",
  "brief.interests": "What interests you",
  "brief.personalise": "Personalise more",
  "brief.personaliseHint": "Describe the walk in your own words. It makes the better tour.",
  "brief.personaliseSet": "Your own words are set — they outrank the settings above.",
  "brief.ownWords": "Tell me in your own words",
  "brief.ownWordsHint": "Anything here outranks the settings above. It makes the better tour.",
  "brief.clearAll": "Clear all",
  "brief.plan": "Plan the walk",
  "brief.readFromBrief": "Length set to {length} from what you wrote — change it above if that is not right.",

  // The options themselves. They were data in flow.ts, in English, which is
  // half an app translated.
  "duration.30": "30 minutes",
  "duration.45": "45 minutes",
  "duration.60": "1 hour",
  "duration.90": "1½ hours",
  "duration.120": "2 hours",
  "duration.180": "3 hours",
  "duration.240": "A whole afternoon",
  "detail.highlights": "Highlights",
  "detail.story": "A story",
  "detail.everything": "In depth",
  "pace.relaxed": "Relaxed",
  "pace.steady": "Steady",
  "pace.cover-ground": "Fast",
  "interest.history": "History",
  "interest.architecture": "Architecture",
  "interest.food": "Food & everyday life",
  "interest.art": "Art",
  "interest.hidden": "Hidden corners",
  "interest.nature": "Nature & parks",
  "interest.music": "Music",
  "interest.literature": "Books & writers",
  "interest.sacred": "Faith & sacred places",
  "interest.royal": "Royalty & power",
  "interest.legends": "Legends & folklore",
  "interest.conflict": "Wars & the darker past",

  // ----------------------------------------------------------------- points
  "points.title": "Where do you start?",
  "points.city": "City",
  "points.change": "Change",
  "points.choose": "Choose",
  "points.whichCity": "Which city?",
  "points.cancel": "Cancel",
  "points.start": "Starting point",
  "points.end": "End point",
  "points.notSet": "Not set",
  "points.useLocation": "Use my location",
  "points.hereNow": "Where I am now",
  "points.locating": "Locating…",
  "points.clear": "Clear",
  "points.searching": "Searching…",
  "points.addEnd": "Choose where to finish (optional)",
  "points.needStart": "Set a starting point",
  "points.loop": "Finishes where it starts",
  "points.bothSet": "Start and finish set",
  "points.create": "Create the tour",

  // ------------------------------------------------------------- generating
  "gen.title": "Making your personal tour…",
  "gen.wait": "This takes up to a minute. Keep the screen open.",
  "gen.failed": "That didn’t work.",
  "gen.retry": "Try again",
  "gen.changeDetails": "Change the details",
  "gen.cancel": "Cancel",

  // ---------------------------------------------------------------- profile
  "profile.title": "My profile",
  "profile.built": "Walks built",
  "profile.stops": "Stops",
  "profile.distance": "Distance",
  "profile.settings": "Settings",
  "profile.settingsHint":
    "These carry over to every new walk. Each one can still be changed while building a tour.",
  "profile.past": "Past walks",
  "profile.empty": "Nothing yet. The walks you build are kept here, on this device.",
  "profile.askedFor": "Asked for",
  "profile.walking": "Walking",
  "profile.theStops": "The stops",
  "profile.walkAgain": "Walk it again",
  "profile.walkAgainHint": "The same stops, in the language you pick.",
  "profile.deleteOne": "Delete this walk",
  "profile.clearAll": "Clear all",
  "profile.save": "Save settings",
  "profile.today": "Today",
  "profile.yesterday": "Yesterday",
} as const;

export type UiKey = keyof typeof EN;

/**
 * One file per language, so a translator opens one file and sees one language.
 * Anything a file leaves out falls back to English, which is what makes a
 * partial translation worth having.
 */
const DICTIONARIES: Record<string, Partial<Record<UiKey, string>>> = {
  en: EN,
  cs,
  de,
  es,
  fr,
  hu,
  it,
  ja,
  ko,
  nl,
  pl,
  pt,
  ru,
  sk,
  tr,
  uk,
  zh,
};

/** Which languages the interface itself is written in, as against the tours. */
export const TRANSLATED = Object.keys(DICTIONARIES);

/**
 * A phrase, in the walker's language, with `{placeholders}` filled in.
 *
 * Falls back to English rather than to the key: a walker seeing
 * "brief.howLong" is worse served than one seeing "How long".
 */
export function translate(
  lang: string,
  key: UiKey,
  values?: Record<string, string | number>,
): string {
  const dictionary = DICTIONARIES[normaliseLang(lang)];
  let out: string = dictionary?.[key] ?? EN[key];
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      out = out.replace(`{${name}}`, String(value));
    }
  }
  return out;
}

// ------------------------------------------------------------ the live one

const LANG_KEY = "btour:draft:v1";
const listeners = new Set<() => void>();
let current: string | null = null;

function read(): string {
  if (current !== null) return current;
  try {
    const raw = localStorage.getItem(LANG_KEY);
    const lang = raw ? (JSON.parse(raw) as { lang?: string }).lang : undefined;
    current = normaliseLang(lang ?? navigator.language);
  } catch {
    current = "en";
  }
  return current;
}

/**
 * Tell every screen at once.
 *
 * The language lives in the draft, which is where a tour reads it from, so
 * there is one setting rather than two that can disagree. This is only the
 * announcement that it changed — the draft is still written by whoever owns
 * it.
 */
export function announceUiLang(lang: string): void {
  current = normaliseLang(lang);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The interface language, live. */
export function useUiLang(): string {
  return useSyncExternalStore(subscribe, read, () => "en");
}

/** `t("brief.howLong")`, bound to the current language. */
export function useT(): (key: UiKey, values?: Record<string, string | number>) => string {
  const lang = useUiLang();
  return (key, values) => translate(lang, key, values);
}
