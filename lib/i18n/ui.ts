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
  "brief.examples": "Or start from one of these",
  "brief.clearAll": "Clear all",
  "brief.plan": "Plan {walk}",

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
  "profile.voice": "Voice",
  "profile.voiceGuide": "Guide",
  "profile.voicePhone": "Phone",
  "profile.voiceHint":
    "The guide’s voice is synthesised and sounds like a person. Your phone’s own voice is free, works offline, and sounds like a phone.",
  "profile.past": "Past walks",
  "profile.empty": "Nothing yet. The walks you build are kept here, on this device.",
  "profile.askedFor": "Asked for",
  "profile.walking": "Walking",
  "profile.theStops": "The stops",
  "profile.deleteOne": "Delete this walk",
  "profile.clearAll": "Clear all",
  "profile.save": "Save settings",
  "profile.today": "Today",
  "profile.yesterday": "Yesterday",
} as const;

export type UiKey = keyof typeof EN;

/**
 * Slovak, because this was built in Bratislava and it is the one language
 * besides English somebody here can check. Every other language falls back to
 * English until a speaker of it fills one in.
 */
const SK: Partial<Record<UiKey, string>> = {
  "landing.walkCity": "Prejdite si {city}",
  "landing.walkAnywhere": "Prejdite si ktorékoľvek mesto",
  "landing.pitch": "Sprievodca v uchu, poskladaný podľa toho, čo naozaj chcete vidieť.",
  "landing.build": "Vytvoriť prehliadku",
  "landing.chooseCity": "Vybrať iné mesto",
  "landing.paused": "Vaša prehliadka, pozastavená",
  "landing.carryOn": "Pokračovať v prechádzke",
  "landing.different": "Vytvoriť inú prehliadku",
  "landing.stopOf": "Zastávka {n} z {total}",

  "brief.title": "Vytvoriť prehliadku",
  "brief.language": "Jazyk",
  "brief.howLong": "Ako dlho",
  "brief.detail": "Koľko detailov",
  "brief.pace": "Tempo",
  "brief.interests": "Čo vás zaujíma",
  "brief.personalise": "Prispôsobiť viac",
  "brief.personaliseHint": "Opíšte prechádzku vlastnými slovami. Vyjde z toho lepšia prehliadka.",
  "brief.personaliseSet": "Vaše slová sú zadané — majú prednosť pred nastaveniami vyššie.",
  "brief.ownWords": "Povedzte mi to vlastnými slovami",
  "brief.ownWordsHint":
    "Čokoľvek tu má prednosť pred nastaveniami vyššie. Vyjde z toho lepšia prehliadka.",
  "brief.examples": "Alebo začnite jedným z týchto",
  "brief.clearAll": "Vymazať všetko",
  "brief.plan": "Naplánovať {walk}",

  "points.title": "Odkiaľ vyrážate?",
  "points.city": "Mesto",
  "points.change": "Zmeniť",
  "points.choose": "Vybrať",
  "points.whichCity": "Ktoré mesto?",
  "points.cancel": "Zrušiť",
  "points.start": "Začiatok",
  "points.end": "Koniec",
  "points.notSet": "Nenastavené",
  "points.useLocation": "Použiť moju polohu",
  "points.locating": "Hľadám polohu…",
  "points.clear": "Vymazať",
  "points.searching": "Hľadám…",
  "points.addEnd": "Vybrať, kde skončiť (nepovinné)",
  "points.needStart": "Nastavte začiatok",
  "points.loop": "Končí tam, kde začína",
  "points.bothSet": "Začiatok aj koniec sú nastavené",
  "points.create": "Vytvoriť prehliadku",

  "gen.title": "Pripravujem vašu prehliadku…",
  "gen.wait": "Potrvá to do minúty. Nechajte obrazovku zapnutú.",
  "gen.failed": "Toto nevyšlo.",
  "gen.retry": "Skúsiť znova",
  "gen.changeDetails": "Zmeniť zadanie",
  "gen.cancel": "Zrušiť",

  "profile.title": "Môj profil",
  "profile.built": "Vytvorené prechádzky",
  "profile.stops": "Zastávky",
  "profile.distance": "Vzdialenosť",
  "profile.settings": "Nastavenia",
  "profile.settingsHint":
    "Toto sa prenesie do každej novej prechádzky. Pri tvorbe prehliadky sa dá zmeniť.",
  "profile.voice": "Hlas",
  "profile.voiceGuide": "Sprievodca",
  "profile.voicePhone": "Telefón",
  "profile.voiceHint":
    "Hlas sprievodcu je syntetizovaný a znie ako človek. Vlastný hlas telefónu je zadarmo, funguje offline a znie ako telefón.",
  "profile.past": "Predošlé prechádzky",
  "profile.empty": "Zatiaľ nič. Prechádzky, ktoré vytvoríte, ostanú tu, v tomto zariadení.",
  "profile.askedFor": "Zadané",
  "profile.walking": "Chôdza",
  "profile.theStops": "Zastávky",
  "profile.deleteOne": "Zmazať túto prechádzku",
  "profile.clearAll": "Vymazať všetko",
  "profile.save": "Uložiť nastavenia",
  "profile.today": "Dnes",
  "profile.yesterday": "Včera",
};

const DICTIONARIES: Record<string, Partial<Record<UiKey, string>>> = { en: EN, sk: SK };

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
