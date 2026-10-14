/**
 * Sample walks: a ready walk of the walker's own city, to try the app on a
 * place they know.
 *
 * People judge a guide by pointing it at a city they know. So the first thing
 * offered is a walk there, already built: the city's most famous sights, which
 * prove it knows the place, with two lesser-known ones among them as the
 * surprise (`secret` stops, the "sample" brief in lib/prompts/tour-plan.ts).
 *
 * Built once per city and language, on the server, the first time anyone asks,
 * with every stop's words written; kept in `sample_tours` (lib/tour/saved.ts).
 * Everyone after opens it instantly. The voice is made as it plays and kept
 * in R2 like any other, so it too is paid for once.
 *
 * It costs the walker nothing: not a walk from their allowance, no sign-in.
 */

import { backendPlanFor } from "@/lib/backend/tours";
import { getLLM, getMaps } from "@/lib/providers/factory";
import type { City, TourRequest } from "@/lib/providers/types";
import type { StoredTour } from "@/lib/tour/flow";
import { orderStops } from "@/lib/tour/order";
import { distanceMeters } from "@/lib/tour/route";
import { routeWithRides } from "@/lib/tour/rides";
import { loadSample, saveSample } from "@/lib/tour/saved";
import { writeStopScript } from "@/lib/tour/scriptCache";
import { snapStopsToRealPlaces } from "@/lib/tour/snapStops";

/** One per city and language. The city's label ("Vienna, Austria") tells two Londons apart. */
export function sampleKey(city: City, lang: string): string {
  return `${city.label.trim().toLowerCase()}|${lang}`;
}

/** An hour on foot: six stops, four famous and two secret. */
function sampleRequest(city: City, lang: string): TourRequest {
  return {
    city,
    lang,
    durationMinutes: 60,
    detail: "highlights",
    pace: "steady",
    interests: [],
    start: { lat: city.lat, lng: city.lng, label: city.name },
    sample: true,
  };
}

/** Closer than this, two stops are the same place. */
const SAME_PLACE_M = 25;

/** Builds in progress on this server, so two visitors from one city pay once. */
const BUILDING = new Map<string, Promise<StoredTour>>();

export async function sampleFor(
  city: City,
  lang: string,
  opts: { beforeBuild?: () => Promise<void> } = {},
): Promise<StoredTour> {
  // A city walk-backend has recorded (Bratislava) plays its recordings:
  // instant, the prepared voice, nothing written live. Not kept as a sample,
  // so it always points at the current recordings (they change with a voice).
  const recorded = await recordedSample(city, lang);
  if (recorded) return recorded;

  const key = sampleKey(city, lang);
  const kept = await loadSample(key).catch(() => null);
  if (kept) return kept;
  const running = BUILDING.get(key);
  if (running) return running;
  await opts.beforeBuild?.();
  const job = build(city, lang)
    .then(async (tour) => {
      await saveSample(key, tour);
      return tour;
    })
    .finally(() => BUILDING.delete(key));
  BUILDING.set(key, job);
  return job;
}

async function recordedSample(city: City, lang: string): Promise<StoredTour | null> {
  const req = sampleRequest(city, lang);
  const recorded = await backendPlanFor(req);
  if (!recorded || recorded.status !== "ready" || !recorded.plan.stops.every((s) => s.audio)) return null;
  const plan = recorded.plan;
  const first = plan.stops[0];
  req.start = { lat: first.lat, lng: first.lng, label: first.name };
  return { plan, ...(await routeFor(plan.stops)), req, sample: true } as StoredTour;
}

async function routeFor(stops: { lat: number; lng: number }[]) {
  try {
    const r = await routeWithRides(getMaps(), stops.map((s) => ({ lat: s.lat, lng: s.lng })), []);
    return { route: r.geojson as unknown as GeoJSON.Feature, meters: r.meters, seconds: r.seconds, maneuvers: r.maneuvers as unknown[] };
  } catch {
    // Stops without a line is still a walk.
    return { route: null, meters: 0, seconds: 0, maneuvers: [] as unknown[] };
  }
}

async function build(city: City, lang: string): Promise<StoredTour> {
  const req = sampleRequest(city, lang);
  const maps = getMaps();
  const plan = await getLLM().generateTourPlan(req);

  // Real coordinates, then walking order — as /api/tours does.
  try {
    const snapped = await snapStopsToRealPlaces(maps, plan.stops, req.start);
    plan.stops = snapped.stops;
  } catch {
    // Estimated coordinates beat no sample.
  }
  // Two names the map put on the same spot are one stop heard twice: keep the
  // first (seen in villages, where the map knows fewer places).
  plan.stops = plan.stops.filter(
    (stop, i) => !plan.stops.slice(0, i).some((prev) => distanceMeters(prev, stop) < SAME_PLACE_M),
  );
  plan.stops = orderStops(plan.stops, req.start);

  // The walk starts at its first stop: nobody trying it is standing at the
  // city centre point it was planned from.
  const first = plan.stops[0];
  req.start = { lat: first.lat, lng: first.lng, label: first.name };

  // Every stop's words now, so opening it never waits for writing.
  const total = plan.stops.length;
  const scripts = await Promise.all(
    plan.stops.map((stop, i) =>
      writeStopScript({ req, stop, previous: i > 0 ? plan.stops[i - 1] : null, position: i + 1, total }),
    ),
  );
  plan.stops = plan.stops.map((stop, i) => ({ ...stop, ...scripts[i] }));

  return { plan, ...(await routeFor(plan.stops)), req, sample: true } as StoredTour;
}
