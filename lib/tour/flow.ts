"use client";

/**
 * The flow's shape and its persistence.
 *
 * State lives in React and localStorage — no database in this MVP. The stages
 * are the screens in order, so `stage` alone says what the user is looking at.
 */

import type {
  City,
  Detail,
  Duration,
  Interest,
  Maneuver,
  Pace,
  TourPlan,
  TourRequest,
} from "@/lib/providers/types";

export type Stage =
  | "start" // map, collapsed sheet: Build my tour
  | "brief" // full sheet: free text, or simple settings
  | "points" // map: starting point, optional end point
  | "generating" // making your personal tour
  | "headphones" // use headphones
  | "tour"; // the route, directions, ask anything

export type Point = { lat: number; lng: number; label?: string };

export type Draft = {
  freeText: string;
  /** Where the walk is. Filled from GPS on arrival, or typed in — the two are
   *  the same field, so choosing a city by hand overrides the fix rather than
   *  fighting it. */
  city: City | null;
  durationMinutes: Duration;
  detail: Detail;
  pace: Pace;
  interests: Interest[];
  start: Point | null;
  end: Point | null;
  lang: string;
};

export const EMPTY_DRAFT: Draft = {
  freeText: "",
  city: null,
  durationMinutes: 45,
  detail: "story",
  pace: "relaxed",
  interests: ["history"],
  start: null,
  end: null,
  lang: "en",
};

/**
 * Values only. What each one is *called* lives in the phrase table, keyed
 * `duration.30` and so on — an English label sitting in here is half an app
 * translated, and it took a language switch to notice.
 */
export const DURATIONS: { value: Duration }[] = [
  { value: 30 },
  { value: 45 },
  { value: 60 },
  { value: 90 },
  { value: 120 },
  { value: 180 },
  { value: 240 },
];

/**
 * One word each on screen — they sit three-across on a phone, about a hundred
 * pixels apiece, and anything longer arrives truncated. The words are in the
 * phrase table under `detail.*` and `pace.*`.
 *
 * What each choice *means* is the prompt's business: see PACE_WORDS and
 * DETAIL_WORDS in lib/prompts/tour-plan.ts, which are English on purpose and
 * are read by the model rather than by the walker.
 */
export const DETAILS: { value: Detail }[] = [
  { value: "highlights" },
  { value: "story" },
  { value: "everything" },
];

export const PACES: { value: Pace }[] = [
  { value: "relaxed" },
  { value: "steady" },
  { value: "cover-ground" },
];

/**
 * The icon is what makes a row of chips scannable at a glance rather than a
 * dozen identical lozenges of text — Airbnb's amenity pills, same idea. It is
 * also the one part of a label that needs no translating.
 *
 * Twelve rather than five, because five made every walk sound the same: three
 * of them are what any guidebook covers, so picking from them told the model
 * nothing it was not already going to say. The seven added are the ones that
 * change which stops get chosen — a walk about music, or about who held power,
 * goes to different corners of a city than a walk about architecture.
 *
 * They are ordered by how many cities can honestly answer them, and each one
 * has to work in every city on the map: the sacred icon is the generic
 * place-of-worship symbol, not a church, because this is not a European app.
 */
export const INTERESTS: { value: Interest; icon: string }[] = [
  { value: "history", icon: "🏛" },
  { value: "architecture", icon: "🏗" },
  { value: "food", icon: "🍽" },
  { value: "art", icon: "🎨" },
  { value: "hidden", icon: "🔎" },
  { value: "nature", icon: "🌳" },
  { value: "music", icon: "🎵" },
  { value: "literature", icon: "📖" },
  { value: "sacred", icon: "🛐" },
  { value: "royal", icon: "👑" },
  { value: "legends", icon: "🐉" },
  { value: "conflict", icon: "🎖" },
];

// ------------------------------------------------------------- persistence

const DRAFT_KEY = "btour:draft:v1";
const TOUR_KEY = "btour:tour:v2";

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Draft) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode */
  }
}

export type StoredTour = {
  plan: TourPlan;
  /** The brief this was built from, so stops written later match the ones
   *  written up front. */
  req?: TourRequest;
  route: GeoJSON.Feature | null;
  meters: number;
  seconds: number;
  /** Empty when the provider could not route — the UI shows the cue instead. */
  maneuvers?: Maneuver[];
};

export function loadTour(): StoredTour | null {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    return raw ? (JSON.parse(raw) as StoredTour) : null;
  } catch {
    return null;
  }
}

export function saveTour(t: StoredTour) {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(t));
  } catch (err) {
    /**
     * Swallowed for the walker's sake — a failed save must not take the walk
     * down with it — but said out loud, because the consequence is that a
     * reload loses the tour and until now nothing anywhere said why. A long
     * walk with every script written is the case that gets near the quota.
     */
    console.warn("[walk] the tour could not be saved; a reload will lose it", err);
  }
}

export function clearTour() {
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    /* ignore */
  }
}
