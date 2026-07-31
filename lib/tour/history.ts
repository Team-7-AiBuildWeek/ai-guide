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
import type { Stop, TourPlan, TourRequest } from "@/lib/providers/types";
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
  /**
   * Enough to walk it a second time.
   *
   * The summary above is for recognising a walk; these two are for rebuilding
   * it. Kept because "the same walk again, in another language" is otherwise
   * impossible: asking the model for the same brief twice gives two different
   * itineraries, and the walker meant *this* one.
   *
   * Optional because every walk saved before this existed has neither, and a
   * history that throws them away to add a button is a bad trade.
   */
  req?: TourRequest;
  /**
   * The stops as walked, minus their narration.
   *
   * The narration is the part that would fill the quota — thirty walks of it
   * is well past what localStorage gives a site — and it is also the part
   * that is wrong in the new language. Coordinates here are the snapped ones,
   * already checked against the real map, so a rebuild needs no geocoding.
   */
  stops?: Stop[];
};

/** A walk that kept enough of itself to be walked again. */
export function canWalkAgain(w: WalkRecord): boolean {
  return !!w.req?.start && !!w.stops?.length;
}

/**
 * The itinerary, in the shape the tour API takes back.
 *
 * Titles and summaries are written in the old language, so they are left
 * behind: a rebuild in Japanese should not open with an English title. What
 * survives is the geography — which places, in which order.
 */
export function planFor(w: WalkRecord): TourPlan | null {
  if (!w.stops?.length) return null;
  return { title: w.title, summary: "", stops: w.stops };
}

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
    req: tour.req,
    // Stripped of narration and of the walking cues, which describe the way
    // from the previous stop in the language it was written in. Both are
    // rewritten per stop on the next walk anyway.
    stops: tour.plan.stops.map(({ script, walkingCueToHere, ...rest }) => {
      void script;
      void walkingCueToHere;
      return rest;
    }),
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
