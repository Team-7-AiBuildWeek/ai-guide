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
import { distanceMeters } from "./route";

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

/** Index of the route point the walker is closest to. */
function nearestIndex(line: Point[], at: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = distanceMeters(line[i], at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
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

  const here = nearestIndex(line, at);

  // The next maneuver that is still ahead. A maneuver exactly at the walker's
  // position counts as ahead — that is the one they are about to perform.
  const upcoming = maneuvers.find((m) => m.beginShapeIndex >= here);
  if (!upcoming) return null;

  // Walk the line from here to there, rather than measuring through walls.
  let meters = distanceMeters(at, line[here]);
  for (let i = here; i < Math.min(upcoming.beginShapeIndex, line.length - 1); i++) {
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
