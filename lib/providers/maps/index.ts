/**
 * Map, geocoding and routing.
 *
 * Note on what is deliberately absent: there is no Google Maps or Google
 * Places implementation, and there must not be one. Their terms forbid using
 * Maps content for text-to-speech and forbid generating content from Maps
 * data, which is precisely what this app does.
 */

import type { GeoJSON, LatLng, Place, WalkingRoute } from "@/lib/providers/types";

export interface MapProvider {
  readonly name: string;
  geocode(query: string): Promise<Place[]>;
  reverseGeocode(lat: number, lng: number): Promise<Place>;
  walkingRoute(points: LatLng[]): Promise<WalkingRoute>;
  /** MapLibre style URL. */
  tileStyleUrl(): string;
}

/** Metres between two points on the earth. */
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A plain straight-line route — the fallback shape when routing is unavailable. */
export function straightLineRoute(points: LatLng[]): WalkingRoute {
  const meters = points
    .slice(1)
    .reduce((sum, p, i) => sum + haversine(points[i], p), 0);
  const geojson: GeoJSON = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
  // 4.5 km/h is an unhurried walking pace for someone stopping to look.
  // A straight line has no turns to describe.
  return { geojson, meters, seconds: Math.round((meters / 4500) * 3600), maneuvers: [] };
}
