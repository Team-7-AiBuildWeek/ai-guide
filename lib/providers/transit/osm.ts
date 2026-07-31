/**
 * Getting across the city without walking it.
 *
 * A walking tour that only walks is stuck in one quarter. The good stuff is
 * often four kilometres apart — a castle on one side, a park across the river
 * — and an hour of pavement between two stops is not a tour, it is a commute
 * with narration.
 *
 * Where the data comes from, and why not somewhere else:
 *
 *  - Stadia's Valhalla, which routes every walk in this app, has no transit at
 *    all. `multimodal` is not one of its costings, and its `bus` costing is a
 *    bus *vehicle* on roads — measured at 6.5 km in 9 minutes for a trip the
 *    tram does in eleven. It answers a question nobody asked.
 *  - Google and Apple both have real transit routing. Google's terms forbid
 *    reading their content aloud, which is the entire app.
 *  - OpenStreetMap has the lines, the stops and the line numbers, free and
 *    without a key. It does not have timetables.
 *
 * So this says "tram 3 from Centrum, five stops" and never "the 14:07". That
 * is the honest shape of the data, and it is also the part a visitor needs:
 * which line, from which stop, and when to get off. A phone's own transit app
 * knows the times, and knows them better than a cached copy would.
 *
 * Server-side only. Overpass is a shared public service, so every query here
 * is narrow and every answer is cached — a broad one timed out on the first
 * attempt and that is the failure mode to design around.
 */

import { distanceMeters } from "@/lib/tour/route";

export type LatLng = { lat: number; lng: number };

export type TransitStop = { name: string; lat: number; lng: number };

export type Ride = {
  /** What to look for on the front of it. */
  mode: "tram" | "bus" | "trolleybus" | "subway" | "light_rail";
  /** The line number, as painted on the vehicle. */
  ref: string;
  /** Where the line is heading, so the walker boards the right direction. */
  headsign?: string;
  board: TransitStop;
  alight: TransitStop;
  /** How many stops to stay on for. */
  stops: number;
  /** Estimated, from distance and mode — OSM carries no timetable. */
  minutes: number;
  /** The walk to the stop and from it, which is part of the cost of riding. */
  walkToBoardM: number;
  walkFromAlightM: number;
};

/**
 * Mirrors, in the order they answered when measured. The main endpoint was
 * the *only* one that responded at all — both community mirrors timed out —
 * so it leads, and the others are there for the day it is down rather than
 * as a load-spreading gesture.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const AGENT = "walk-audio-tours/1.0 (https://github.com/Team-7-AiBuildWeek/ai-guide)";

/** How far a walker will go to a stop rather than walking the whole way. */
const TO_STOP_M = 450;

/** Below this, walk. A ride that saves four minutes costs more in faff. */
const WORTH_RIDING_M = 1200;

/**
 * Average speeds, door to door, including the stopping.
 *
 * Not the vehicle's top speed — a tram that does 50 between stops averages
 * about 18 once the stopping is counted, and the number that matters is the
 * one that predicts arrival.
 */
const KMH: Record<Ride["mode"], number> = {
  tram: 18,
  subway: 30,
  light_rail: 25,
  trolleybus: 15,
  bus: 15,
};

/** Waiting for it is part of riding it, and no timetable means assuming. */
const WAIT_MIN = 5;

/**
 * How many shared lines are worth reading the stops of.
 *
 * Each one is an Overpass query per direction. Where two places are joined at
 * all they are usually joined by one or two lines, and the tenth candidate has
 * never won — it only costs the walker their tour, since generation has a
 * budget for everything and this is one leg of it.
 */
const MAX_LINES_TRIED = 3;

const ROUTE_KINDS = "tram|bus|trolleybus|subway|light_rail";

type OverpassNode = { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> };
type OverpassRel = {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
};
type Element = OverpassNode | OverpassRel;

const CACHE = new Map<string, unknown>();
const MAX_ENTRIES = 200;

function remember<T>(key: string, value: T): T {
  CACHE.set(key, value);
  while (CACHE.size > MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  return value;
}

async function overpass(query: string): Promise<Element[] | null> {
  const hit = CACHE.get(query);
  if (hit !== undefined) return hit as Element[] | null;

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        // Transit lines change on the order of years; the tiles they run on
        // change less. A day is conservative.
        next: { revalidate: 60 * 60 * 24 },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { elements?: Element[] };
      return remember(query, body.elements ?? []);
    } catch {
      // Try the next mirror. A tour without a ride is a worse tour, not a
      // broken one, so exhausting them all is a null rather than a throw.
    }
  }
  return remember(query, null);
}

/** The line's identity for comparing two ends of a journey: kind and number. */
function lineKey(tags: Record<string, string> | undefined): string | null {
  const route = tags?.route;
  const ref = tags?.ref;
  if (!route || !ref) return null;
  return `${route}|${ref}`;
}

/** Which lines call anywhere near a point. */
async function linesNear(at: LatLng): Promise<Map<string, OverpassRel[]>> {
  const q =
    `[out:json][timeout:50];` +
    `node(around:${TO_STOP_M},${at.lat.toFixed(5)},${at.lng.toFixed(5)})["public_transport"="stop_position"]->.s;` +
    `rel(bn.s)["type"="route"]["route"~"${ROUTE_KINDS}"];` +
    `out tags;`;

  const els = (await overpass(q)) ?? [];
  const byLine = new Map<string, OverpassRel[]>();
  for (const e of els) {
    if (e.type !== "relation") continue;
    const key = lineKey(e.tags);
    if (!key) continue;
    const list = byLine.get(key) ?? [];
    list.push(e);
    byLine.set(key, list);
  }
  return byLine;
}

/**
 * The stops of a line, in the order the vehicle calls at them.
 *
 * The relation's member list is what carries that order, so it is read from
 * there rather than from the returned nodes, which come back in whatever order
 * Overpass likes. Ways are ignored: those are the rails and the roads.
 *
 * `out body` on the nodes, not `out skel`. Skel returns coordinates without
 * tags, so every stop came back nameless, every one was dropped for having no
 * name to tell a walker, and the whole feature silently decided that no line
 * anywhere joined any two places. Measured on tram 3: skel gives 34 nodes and
 * 0 names, body gives 34 and 34.
 */
async function stopsOf(relationId: number): Promise<TransitStop[]> {
  const q =
    `[out:json][timeout:50];` +
    `rel(id:${relationId});` +
    `out body;` +
    `node(r);` +
    `out body qt;`;

  const els = (await overpass(q)) ?? [];
  const rel = els.find((e): e is OverpassRel => e.type === "relation");
  if (!rel?.members) return [];

  const coords = new Map<number, OverpassNode>();
  for (const e of els) if (e.type === "node") coords.set(e.id, e);

  const names = new Map<number, string>();
  for (const e of els) {
    if (e.type === "node" && e.tags?.name) names.set(e.id, e.tags.name);
  }

  const out: TransitStop[] = [];
  for (const m of rel.members) {
    if (m.type !== "node") continue;
    // Platforms and stop positions both mark a calling point; the roles vary
    // by mapper and by country, so anything that is not plainly something else
    // counts.
    if (m.role && !/^(stop|platform)/.test(m.role)) continue;
    const node = coords.get(m.ref);
    if (!node) continue;
    const name = names.get(m.ref) ?? node.tags?.name;
    // A calling point with no name cannot be told to a walker.
    if (!name) continue;
    // The same stop is often both a platform and a stop_position; one entry.
    const last = out[out.length - 1];
    if (last?.name === name) continue;
    out.push({ name, lat: node.lat, lng: node.lon });
  }
  return out;
}

function nearest(stops: TransitStop[], to: LatLng): { at: number; dist: number } | null {
  let best: { at: number; dist: number } | null = null;
  stops.forEach((s, i) => {
    const dist = distanceMeters(to, { lat: s.lat, lng: s.lng });
    if (!best || dist < best.dist) best = { at: i, dist };
  });
  return best;
}

/**
 * A ride from one place to another, or null when walking is the answer.
 *
 * Null is the common and correct result: most pairs of stops on a walking
 * tour are a walk. It is returned when the two are close enough to walk, when
 * no single line joins them, when the line would not actually save any time,
 * and whenever Overpass cannot be reached — a tour with no ride in it is a
 * smaller tour, not a failed one.
 *
 * One line only. Nobody on a two-hour walking tour of a city they do not know
 * wants to change at an interchange they have never heard of.
 */
export async function findRide(from: LatLng, to: LatLng): Promise<Ride | null> {
  const asCrow = distanceMeters(from, to);
  if (asCrow < WORTH_RIDING_M) return null;

  const [here, there] = await Promise.all([linesNear(from), linesNear(to)]);
  if (here.size === 0 || there.size === 0) return null;

  const shared = [...here.keys()].filter((k) => there.has(k)).slice(0, MAX_LINES_TRIED);
  if (shared.length === 0) return null;

  /**
   * Every direction of every shared line, at once.
   *
   * A line is two relations, one per direction, and reading a relation's stops
   * is a second Overpass query apiece. Done one after another that was 70
   * seconds for a single leg — measured, on a tour that has 120 seconds for
   * everything. They do not depend on each other, so they do not wait for each
   * other.
   */
  const relations = shared.flatMap((key) =>
    (here.get(key) ?? []).slice(0, 2).map((rel) => ({ key, rel })),
  );
  const withStops = await Promise.all(
    relations.map(async ({ key, rel }) => ({ key, rel, stops: await stopsOf(rel.id) })),
  );

  let best: Ride | null = null;

  for (const { key, rel, stops } of withStops) {
    if (stops.length < 2) continue;

    const board = nearest(stops, from);
    const alight = nearest(stops, to);
    if (!board || !alight) continue;
    if (board.dist > TO_STOP_M || alight.dist > TO_STOP_M) continue;
    // Riding backwards along the relation is the other direction's job.
    if (alight.at <= board.at) continue;

    const [route, ref] = key.split("|");
    const mode = (route as Ride["mode"]) in KMH ? (route as Ride["mode"]) : "bus";
    const rideM = distanceMeters(
      { lat: stops[board.at].lat, lng: stops[board.at].lng },
      { lat: stops[alight.at].lat, lng: stops[alight.at].lng },
    );
    const minutes = Math.max(2, Math.round((rideM / 1000 / KMH[mode]) * 60)) + WAIT_MIN;

    /**
     * Riding has to beat walking, counting the walk to the stop, the wait,
     * and the walk at the far end. A tram that saves two minutes and costs a
     * walker their bearings is not an improvement.
     */
    const walkingMin = (asCrow / 1000 / 4.5) * 60;
    const ridingMin = minutes + ((board.dist + alight.dist) / 1000 / 4.5) * 60;
    if (ridingMin >= walkingMin) continue;

    const ride: Ride = {
      mode,
      ref,
      headsign: rel.tags?.to,
      board: stops[board.at],
      alight: stops[alight.at],
      stops: alight.at - board.at,
      minutes,
      walkToBoardM: Math.round(board.dist),
      walkFromAlightM: Math.round(alight.dist),
    };
    if (!best || ride.minutes < best.minutes) best = ride;
  }

  return best;
}
