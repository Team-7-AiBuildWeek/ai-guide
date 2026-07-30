/** Mapbox: tiles, geocoding and walking directions. */

import { config, requireKey } from "@/lib/config";
import { geocodeLanguages } from "@/lib/i18n/languages";
import {
  ProviderError,
  type LatLng,
  type MapStyle,
  type Place,
  type WalkingRoute,
} from "@/lib/providers/types";
import type { MapProvider, GeocodeBounds, GeocodeOptions } from "./index";

const GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";

/** Settlements only, for "which city am I in". */
const CITY_TYPES = "place,locality";
/** Things with a front door — never an administrative area. See GeocodeKind. */
const PRECISE_TYPES = "poi,address";

/**
 * Mapbox bounds a search with a rectangle, not a circle, so the radius becomes
 * the box that contains it. Slightly generous at the corners, which is the
 * right way to be wrong: a stop just outside is better found than lost.
 */
function bbox({ lat, lng, radiusKm }: GeocodeBounds): [number, number, number, number] {
  const dLat = radiusKm / 111.32;
  // Meridians converge towards the poles; near one, a kilometre is many degrees.
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [
    Math.max(-180, lng - dLng),
    Math.max(-90, lat - dLat),
    Math.min(180, lng + dLng),
    Math.min(90, lat + dLat),
  ];
}

type GeocodeResponse = {
  features: Array<{ id: string; text: string; place_name: string; center: [number, number] }>;
};

type DirectionsResponse = {
  routes: Array<{ geometry: unknown; distance: number; duration: number }>;
};

export class MapboxMapProvider implements MapProvider {
  readonly name = "mapbox";

  private token(): string {
    return requireKey(config.mapboxAccessToken, "MAPBOX_ACCESS_TOKEN", "mapbox");
  }

  async geocode(query: string, opts?: GeocodeOptions): Promise<Place[]> {
    const { bounds, focus, kind = "place" } = opts ?? {};
    // No country filter: the walk can be in any city, and pinning this to one
    // meant a search in Vienna returned Slovak towns with similar names.
    // Nearness does the work instead — `bounds` excludes, `focus` only ranks.
    const near = bounds ?? focus;
    const params = new URLSearchParams({
      access_token: this.token(),
      limit: "6",
      language: geocodeLanguages(opts?.lang),
      ...(bounds ? { bbox: bbox(bounds).join(",") } : {}),
      ...(near ? { proximity: `${near.lng},${near.lat}` } : {}),
      ...(kind === "city" ? { types: CITY_TYPES } : kind === "precise" ? { types: PRECISE_TYPES } : {}),
    });
    const url = `${GEOCODE}/${encodeURIComponent(query)}.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as GeocodeResponse;
    return body.features.map((f) => ({
      id: f.id,
      name: f.text,
      address: f.place_name,
      lat: f.center[1],
      lng: f.center[0],
    }));
  }

  async reverseGeocode(lat: number, lng: number, opts?: GeocodeOptions): Promise<Place> {
    const url =
      `${GEOCODE}/${lng},${lat}.json?access_token=${this.token()}&limit=1` +
      `&language=${geocodeLanguages(opts?.lang)}`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as GeocodeResponse;
    const f = body.features[0];
    return f
      ? { id: f.id, name: f.text, address: f.place_name, lat, lng }
      : { id: `pin-${lat},${lng}`, name: "Dropped pin", address: "", lat, lng };
  }

  async walkingRoute(points: LatLng[]): Promise<WalkingRoute> {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${DIRECTIONS}/${coords}?access_token=${this.token()}&geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as DirectionsResponse;
    const route = body.routes[0];
    if (!route) throw new ProviderError(this.name, "no walking route found");
    return {
      geojson: { type: "Feature", properties: {}, geometry: route.geometry as object },
      meters: route.distance,
      seconds: route.duration,
      // Mapbox returns steps too; not parsed yet, so no arrows from this one.
      maneuvers: [],
    };
  }

  tileStyleUrl(): string {
    return this.styles()[0].url;
  }

  styles(): MapStyle[] {
    const url = (m: string) => `https://api.mapbox.com/styles/v1/mapbox/${m}?access_token=${this.token()}`;
    return [
      { id: "streets-v12", label: "Map", url: url("streets-v12") },
      { id: "satellite-streets-v12", label: "Satellite", url: url("satellite-streets-v12") },
      { id: "outdoors-v12", label: "Outdoors", url: url("outdoors-v12") },
    ];
  }
}
