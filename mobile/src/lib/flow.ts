/**
 * The flow's shape and what it remembers — the website's lib/tour/flow.ts.
 *
 *   start -> brief -> points -> generating -> headphones -> tour
 */

import { readJson, removeJson, writeJson } from "./store";
import type { Detail, Draft, Duration, Interest, Pace, StoredTour } from "./types";

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

export const DURATIONS: Duration[] = [30, 45, 60, 90, 120, 180, 240];
export const DETAILS: Detail[] = ["highlights", "story", "everything"];
export const PACES: Pace[] = ["relaxed", "steady", "cover-ground"];

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

const DRAFT_KEY = "draft-v1";
const TOUR_KEY = "tour-v2";
const PROGRESS_KEY = "progress-v1";

export function loadDraft(): Draft | null {
  const d = readJson<Draft>(DRAFT_KEY);
  return d ? { ...EMPTY_DRAFT, ...d } : null;
}

export function saveDraft(d: Draft) {
  writeJson(DRAFT_KEY, d);
}

/** Back to defaults for the next walk; the language stays (see the website's note). */
export function resetDraft(lang: string): Draft {
  const fresh: Draft = { ...EMPTY_DRAFT, lang };
  writeJson(DRAFT_KEY, fresh);
  return fresh;
}

export function loadTour(): StoredTour | null {
  return readJson<StoredTour>(TOUR_KEY);
}

export function saveTour(t: StoredTour) {
  writeJson(TOUR_KEY, t);
}

export function clearTour() {
  removeJson(TOUR_KEY);
  removeJson(PROGRESS_KEY);
}

/** Which stop the walk was on, so reopening the app lands where it was left. */
export function loadProgress(): number {
  return readJson<{ index: number }>(PROGRESS_KEY)?.index ?? 0;
}

export function saveProgress(index: number) {
  writeJson(PROGRESS_KEY, { index });
}

// ------------------------------------------------------------------ timing
// lib/tour/timing.ts: walking at a tourist's pace plus standing at every stop.

const SPEED_MPS: Record<Pace, number> = { relaxed: 1.0, steady: 1.2, "cover-ground": 1.4 };
const SPOKEN_MINUTES: Record<Detail, number> = { highlights: 4, story: 4.5, everything: 5 };

export function tourMinutes(tour: StoredTour): number {
  const pace = tour.req?.pace ?? "steady";
  const detail = tour.req?.detail ?? "story";
  const walking = tour.meters > 0 ? Math.round(tour.meters / SPEED_MPS[pace]) : tour.seconds;
  const listening = Math.round(tour.plan.stops.length * SPOKEN_MINUTES[detail] * 60);
  const riding = (tour.rides ?? []).reduce((s, r) => s + r.minutes * 60, 0);
  return Math.max(1, Math.round((walking + riding + listening) / 60));
}
