"use client";

/**
 * Which turn is next, and how far away it is.
 *
 * The router gives maneuvers keyed to positions along the route line, not to
 * the walker. Turning that into "left in 40 m" means finding where on the line
 * the walker actually is, then measuring forward along the line rather than
 * straight through the buildings between them.
 */

import type { Maneuver } from "@/lib/providers/types";
import { distanceMeters, interpolate } from "./route";

export type NextTurn = {
  maneuver: Maneuver;
  /** Metres to walk before doing it, along the route. */
  meters: number;
};

type Point = { lat: number; lng: number };

/** GeoJSON stores [lng, lat]; everything else here uses {lat, lng}. */
function toPoints(route: GeoJSON.Feature | null): Point[] {
  const geom = route?.geometry;
  if (!geom || geom.type !== "LineString") return [];
  return (geom.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
}

/**
 * Where on the route the walker is: the closest point on any *segment*, and
 * how far along that segment it falls.
 *
 * The corners are not the route — they are only where it changes direction. A
 * router will happily send back a straight two-hundred-metre stretch as two
 * points, and asking which corner is nearest puts a walker halfway down it at
 * one end or the other. That error goes straight into "turn left in 40 m".
 */
export type RoutePosition = {
  /** The segment the walker is on, as the index of its first point. */
  index: number;
  /** How far along that segment, 0 at `index` and 1 at `index + 1`. */
  t: number;
  /** The point on the line itself. */
  point: Point;
  /** Metres from the walker to that point — how far off the route they are. */
  offRoute: number;
};

export function projectOnRoute(line: Point[], at: Point): RoutePosition {
  let best: RoutePosition = { index: 0, t: 0, point: line[0], offRoute: Infinity };

  // Longitude degrees are shorter than latitude ones everywhere but the
  // equator, so they are scaled before any of this is treated as flat.
  const kx = Math.cos((at.lat * Math.PI) / 180);

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const abx = (b.lng - a.lng) * kx;
    const aby = b.lat - a.lat;
    const apx = (at.lng - a.lng) * kx;
    const apy = at.lat - a.lat;

    const lenSq = abx * abx + aby * aby;
    // A zero-length segment is a duplicated point; its start answers for it.
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq)) : 0;
    const point = interpolate(a, b, t);
    const offRoute = distanceMeters(at, point);

    if (offRoute < best.offRoute) best = { index: i, t, point, offRoute };
  }

  return best;
}

export function nextTurn(
  route: GeoJSON.Feature | null,
  maneuvers: Maneuver[] | undefined,
  at: Point | null,
): NextTurn | null {
  if (!route || !maneuvers?.length || !at) return null;
  const line = toPoints(route);
  if (line.length < 2) return null;

  const here = projectOnRoute(line, at);

  // A maneuver at the corner behind us has been performed, however close it
  // still is. Only one standing exactly on the walker counts as ahead — that
  // is the one they are about to do.
  const passed = here.t > 0 ? here.index + 1 : here.index;
  const upcoming = maneuvers.find((m) => m.beginShapeIndex >= passed);
  if (!upcoming) return null;

  // Walk the line from here to there, rather than measuring through walls.
  const target = Math.min(upcoming.beginShapeIndex, line.length - 1);
  let meters = distanceMeters(here.point, line[Math.min(here.index + 1, target)]);
  for (let i = here.index + 1; i < target; i++) {
    meters += distanceMeters(line[i], line[i + 1]);
  }

  return { maneuver: upcoming, meters };
}

/** "40 m", "1.2 km" — short enough to read at a glance while moving. */
export function formatDistance(meters: number): string {
  if (meters < 10) return "now";
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
