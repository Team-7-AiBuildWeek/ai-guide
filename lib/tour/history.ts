"use client";

/**
 * The walks someone has built, kept.
 *
 * The app already stores *the* tour — one slot, overwritten by the next one —
 * because that is all the walk itself needs. This is the other question: what
 * have I done. It holds a summary rather than the tour, because a tour carries
 * every stop's narration and thirty of those would fill the quota localStorage
 * gives a site; the stop names are the part anybody recognises a walk by.
 *
 * Nothing here is a record of where a person has been beyond what they built.
 * It lives on their device and is deleted from the same page it is read on.
 */

import type { StoredTour } from "./flow";
import { tourTiming } from "./timing";

export type WalkRecord = {
  /** When it was built, and the identity — two walks a second apart is not a
   *  thing a person does. */
  at: number;
  title: string;
  city?: string;
  lang: string;
  /** What was asked for, and what came back. */
  minutes: number;
  stopNames: string[];
  meters: number;
  seconds: number;
  /** The walker's own brief, when they wrote one. */
  freeText?: string;
};

const KEY = "btour:history:v1";
/** Enough to recognise a habit, few enough to never trouble the quota. */
const KEEP = 30;

export function loadWalks(): WalkRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as WalkRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(walks: WalkRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(walks.slice(0, KEEP)));
  } catch {
    /* private mode, or full. A history is not worth failing a walk over. */
  }
}

/** Summarise a freshly built tour and put it at the top. */
export function rememberWalk(tour: StoredTour): void {
  const record: WalkRecord = {
    at: Date.now(),
    title: tour.plan.title,
    city: tour.req?.city?.name,
    lang: tour.req?.lang ?? "en",
    minutes: tour.req?.durationMinutes ?? 0,
    stopNames: tour.plan.stops.map((s) => s.name),
    meters: tour.meters,
    // The whole walk, not the router's moving time: this sits next to "asked
    // for 45 min" in the profile, and two numbers measuring different things
    // under one heading is how a walk looks like it came in early when it ran
    // an hour over.
    seconds: tourTiming(tour).total,
    freeText: tour.req?.freeText,
  };
  save([record, ...loadWalks()]);
}

export function forgetWalk(at: number): WalkRecord[] {
  const left = loadWalks().filter((w) => w.at !== at);
  save(left);
  return left;
}

export function forgetAllWalks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** "2.4 km", "800 m" — the same shape the tour screen uses. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return meters < 1000 ? `${Math.round(meters / 50) * 50} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Today and yesterday by name, everything older by date. */
export function formatWhen(at: number, lang: string): string {
  const then = new Date(at);
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  try {
    return then.toLocaleDateString(lang, { day: "numeric", month: "long" });
  } catch {
    return then.toLocaleDateString();
  }
}
