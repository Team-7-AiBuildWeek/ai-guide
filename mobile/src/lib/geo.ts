/**
 * Distances and turn-by-turn, from the website's lib/tour/route.ts and
 * lib/tour/navigation.ts.
 */

import type { LatLng, Maneuver, RouteFeature } from "./types";

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** The route's line as points, in walking order. */
export function routePoints(route: RouteFeature | null | undefined): LatLng[] {
  const geom = route?.geometry;
  if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return [];
  return (geom.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
}

type RoutePosition = { index: number; t: number; point: LatLng; offRoute: number };

function projectOnRoute(line: LatLng[], at: LatLng): RoutePosition {
  let best: RoutePosition = { index: 0, t: 0, point: line[0], offRoute: Infinity };
  const kx = Math.cos((at.lat * Math.PI) / 180);
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const abx = (b.lng - a.lng) * kx;
    const aby = b.lat - a.lat;
    const apx = (at.lng - a.lng) * kx;
    const apy = at.lat - a.lat;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq)) : 0;
    const point = interpolate(a, b, t);
    const offRoute = distanceMeters(at, point);
    if (offRoute < best.offRoute) best = { index: i, t, point, offRoute };
  }
  return best;
}

export type NextTurn = { maneuver: Maneuver; meters: number };

/** The next turn ahead of the walker along the route, and how far it is. */
export function nextTurn(line: LatLng[], maneuvers: Maneuver[] | undefined, at: LatLng | null): NextTurn | null {
  if (!maneuvers?.length || !at || line.length < 2) return null;
  const here = projectOnRoute(line, at);
  const passed = here.t > 0 ? here.index + 1 : here.index;
  const upcoming = maneuvers.find((m) => m.beginShapeIndex >= passed);
  if (!upcoming) return null;
  const target = Math.min(upcoming.beginShapeIndex, line.length - 1);
  let meters = distanceMeters(here.point, line[Math.min(here.index + 1, target)]);
  for (let i = here.index + 1; i < target; i++) meters += distanceMeters(line[i], line[i + 1]);
  return { maneuver: upcoming, meters };
}

export function formatDistance(meters: number): string {
  if (meters < 10) return "now";
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Past this, a fix is a guess about which street you are on (lib/tour/fixQuality.ts). */
export const TRUSTED_M = 30;
