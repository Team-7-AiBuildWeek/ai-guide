"use client";

/**
 * The flow's shape and its persistence.
 *
 * State lives in React and localStorage — no database in this MVP. The stages
 * are the screens in order, so `stage` alone says what the user is looking at.
 */

import type { City, Detail, Duration, Interest, Maneuver, Pace, TourPlan } from "@/lib/providers/types";

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
  useSimpleSettings: boolean;
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
  useSimpleSettings: false,
  durationMinutes: 45,
  detail: "story",
  pace: "relaxed",
  interests: ["history"],
  start: null,
  end: null,
  lang: "en",
};

export const DURATIONS: { value: Duration; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1½ hours" },
];

export const DETAILS: { value: Detail; label: string }[] = [
  { value: "highlights", label: "Just the highlights" },
  { value: "story", label: "A good story" },
  { value: "everything", label: "Tell me everything" },
];

export const PACES: { value: Pace; label: string }[] = [
  { value: "relaxed", label: "Relaxed, lots of stops" },
  { value: "steady", label: "Steady" },
  { value: "cover-ground", label: "Cover more ground" },
];

export const INTERESTS: { value: Interest; label: string }[] = [
  { value: "history", label: "History" },
  { value: "architecture", label: "Architecture" },
  { value: "food", label: "Food & everyday life" },
  { value: "art", label: "Art" },
  { value: "hidden", label: "Hidden corners" },
];

/** Examples that fill the box, so nobody faces a blank page. */
export const EXAMPLE_BRIEFS = [
  "Old town history, not too much walking, something about the coronations",
  "Architecture and hidden courtyards, I have an hour",
  "Where people actually eat, and why the old town looks like this",
  "Tell me everything — I have all afternoon",
];

// ------------------------------------------------------------- persistence

const DRAFT_KEY = "btour:draft:v1";
const TOUR_KEY = "btour:tour:v1";

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
  } catch {
    /* quota — a long tour with full scripts can be large */
  }
}

export function clearTour() {
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    /* ignore */
  }
}
