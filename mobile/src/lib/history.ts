/**
 * Every walk built on this phone, newest first — the website's
 * lib/tour/history.ts. Kept with its brief and its stops (not their scripts),
 * so a walk can be built again with the same stops.
 */

import { tourMinutes } from "./flow";
import { readJson, writeJson } from "./store";
import type { Stop, StoredTour, TourPlan, TourRequest } from "./types";

export type WalkRecord = {
  at: number;
  title: string;
  city?: string;
  lang: string;
  minutes: number;
  stopNames: string[];
  meters: number;
  seconds: number;
  freeText?: string;
  req?: TourRequest;
  stops?: Stop[];
};

const KEY = "history-v1";
const KEEP = 30;

export function loadWalks(): WalkRecord[] {
  const walks = readJson<WalkRecord[]>(KEY);
  return Array.isArray(walks) ? walks : [];
}

function save(walks: WalkRecord[]) {
  writeJson(KEY, walks.slice(0, KEEP));
}

export function rememberWalk(tour: StoredTour): void {
  const record: WalkRecord = {
    at: Date.now(),
    title: tour.plan.title,
    city: tour.req?.city?.name,
    lang: tour.req?.lang ?? "en",
    minutes: tour.req?.durationMinutes ?? 0,
    stopNames: tour.plan.stops.map((s) => s.name),
    meters: tour.meters,
    seconds: tourMinutes(tour) * 60,
    freeText: tour.req?.freeText,
    req: tour.req,
    stops: tour.plan.stops.map(({ script: _s, walkingCueToHere: _c, ...rest }) => rest),
  };
  save([record, ...loadWalks()]);
}

/** Walks kept for this account on another device, folded into this phone's list. */
export function mergeWalks(remote: WalkRecord[]): WalkRecord[] {
  const byAt = new Map<number, WalkRecord>();
  for (const w of [...loadWalks(), ...remote]) if (Number.isFinite(w?.at) && !byAt.has(w.at)) byAt.set(w.at, w);
  const merged = [...byAt.values()].sort((a, b) => b.at - a.at).slice(0, KEEP);
  save(merged);
  return merged;
}

export function forgetWalk(at: number): WalkRecord[] {
  const left = loadWalks().filter((w) => w.at !== at);
  save(left);
  return left;
}

export function canWalkAgain(w: WalkRecord): boolean {
  return !!w.req?.start && !!w.stops?.length;
}

export function planFor(w: WalkRecord): TourPlan | null {
  return w.stops?.length ? { title: w.title, summary: "", stops: w.stops } : null;
}

/** A walk asked for again from the profile, picked up once by the flow. */
const REBUILD_KEY = "rebuild-v1";

export function saveRebuild(r: { req: TourRequest; plan: TourPlan }) {
  writeJson(REBUILD_KEY, r);
}

export function takeRebuild(): { req: TourRequest; plan: TourPlan } | null {
  const r = readJson<{ req: TourRequest; plan: TourPlan }>(REBUILD_KEY);
  writeJson(REBUILD_KEY, null);
  return r?.req?.start && r?.plan?.stops?.length ? r : null;
}

export function formatKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return meters < 1000 ? `${Math.round(meters / 50) * 50} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatWhen(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
