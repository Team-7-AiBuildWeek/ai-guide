/**
 * Map, geocoding and routing.
 *
 * Note on what is deliberately absent: there is no Google Maps or Google
 * Places implementation, and there must not be one. Their terms forbid using
 * Maps content for text-to-speech and forbid generating content from Maps
 * data, which is precisely what this app does.
 */

import type { GeoJSON, LatLng, MapStyle, Place, WalkingRoute } from "@/lib/providers/types";

/** Confine a search to a circle. A soft bias is not enough: "Michael's Gate"
 *  outranks Michalská brána from England unless the rest of the world is
 *  excluded outright. */
export type GeocodeBounds = { lat: number; lng: number; radiusKm: number };

/**
 * What is being looked for.
 *
 * - "city" ranges over the whole world and returns only settlements.
 * - "precise" returns only things with a front door: a building, a monument,
 *   a street. Never an administrative area — a search for "Stephansdom"
 *   otherwise matches the *district* of that name, whose centre is 439m from
 *   the cathedral, and a stop snapped there is worse than one left alone.
 * - "place" is the ordinary search box: anything, ranked by nearness.
 */
export type GeocodeKind = "place" | "city" | "precise";

export type GeocodeOptions = {
  bounds?: GeocodeBounds;
  /** Ranks nearby results first without excluding anything. */
  focus?: LatLng;
  kind?: GeocodeKind;
  /** BCP-47 for the returned labels. Defaults to English, which is the only
   *  safe answer for a search that can land in any country. */
  lang?: string;
};

export interface MapProvider {
  readonly name: string;
  geocode(query: string, opts?: GeocodeOptions): Promise<Place[]>;
  reverseGeocode(lat: number, lng: number, opts?: GeocodeOptions): Promise<Place>;
  walkingRoute(points: LatLng[]): Promise<WalkingRoute>;
  /** MapLibre style URL for the default basemap. */
  tileStyleUrl(): string;
  /**
   * Every basemap this provider can offer, so the walker can switch to
   * satellite. One entry is a perfectly good answer.
   */
  styles(): MapStyle[];
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
