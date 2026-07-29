/**
 * The fully open stack: OpenRouteService for walking routes, Nominatim for
 * geocoding, OpenFreeMap for tiles. Only routing needs a key, and it is free.
 *
 * Nominatim's usage policy is strict — one request per second, a real
 * User-Agent with contact details, no bulk querying. The autocomplete in step 3
 * must debounce hard or we get blocked.
 */

import { config, requireKey } from "@/lib/config";
import {
  ProviderError,
  type LatLng,
  type MapStyle,
  type Place,
  type WalkingRoute,
} from "@/lib/providers/types";
import { straightLineRoute, type MapProvider, type GeocodeOptions } from "./index";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const ORS = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

type NominatimPlace = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
};

type ORSResponse = {
  features: Array<{
    properties: { summary?: { distance?: number; duration?: number } };
    geometry: unknown;
  }>;
};

export class OSMMapProvider implements MapProvider {
  readonly name = "osm";

  private headers(): HeadersInit {
    return { "user-agent": config.nominatimUserAgent, accept: "application/json" };
  }

  async geocode(query: string, opts: GeocodeOptions = {}): Promise<Place[]> {
    const { bounds, kind = "place", lang = "en" } = opts;
    // A viewbox is a rectangle and the bound we are given is a circle, so this
    // is the circle's bounding box — slightly generous at the corners, which
    // only ever admits a candidate the distance check would reject anyway.
    const box = bounds
      ? (() => {
          const dLat = bounds.radiusKm / 111.32;
          const dLng = bounds.radiusKm / (111.32 * Math.cos((bounds.lat * Math.PI) / 180));
          return `&viewbox=${bounds.lng - dLng},${bounds.lat - dLat},${bounds.lng + dLng},${bounds.lat + dLat}&bounded=1`;
        })()
      : "";
    const url =
      `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=${encodeURIComponent(lang)}` +
      (kind === "city" ? "&featureType=city" : "") +
      box +
      `&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as NominatimPlace[];
    return body.map((p) => ({
      id: String(p.place_id),
      name: p.name || p.display_name.split(",")[0],
      address: p.display_name,
      lat: Number(p.lat),
      lng: Number(p.lon),
    }));
  }

  async reverseGeocode(lat: number, lng: number, opts: GeocodeOptions = {}): Promise<Place> {
    const { kind = "place", lang = "en" } = opts;
    // zoom=10 is Nominatim's city level; the default resolves to a building.
    const url =
      `${NOMINATIM}/reverse?format=jsonv2&accept-language=${encodeURIComponent(lang)}` +
      (kind === "city" ? "&zoom=10" : "") +
      `&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const p = (await res.json()) as NominatimPlace;
    return {
      id: String(p.place_id ?? `pin-${lat},${lng}`),
      name: p.name || p.display_name?.split(",")[0] || "Dropped pin",
      address: p.display_name ?? "",
      // A city answers with its own centre; a pin stays where it was dropped.
      lat: kind === "city" ? Number(p.lat) : lat,
      lng: kind === "city" ? Number(p.lon) : lng,
    };
  }

  async walkingRoute(points: LatLng[]): Promise<WalkingRoute> {
    // Routing is the only part of this stack that needs a key. Without one,
    // the map still works — the drawn line is just straight between stops.
    if (!config.openrouteserviceApiKey) return straightLineRoute(points);

    const res = await fetch(ORS, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: requireKey(
          config.openrouteserviceApiKey,
          "OPENROUTESERVICE_API_KEY",
          "osm",
        ),
      },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
    });
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as ORSResponse;
    const feature = body.features?.[0];
    if (!feature) throw new ProviderError(this.name, "no walking route found");
    return {
      geojson: { type: "Feature", properties: {}, geometry: feature.geometry as object },
      meters: feature.properties.summary?.distance ?? 0,
      seconds: feature.properties.summary?.duration ?? 0,
      // OpenRouteService returns segments/steps; not parsed yet.
      maneuvers: [],
    };
  }

  tileStyleUrl(): string {
    return this.styles()[0].url;
  }

  /** OpenFreeMap has no satellite layer — imagery is not free. */
  styles(): MapStyle[] {
    return [
      { id: "liberty", label: "Map", url: "https://tiles.openfreemap.org/styles/liberty" },
      { id: "bright", label: "Bright", url: "https://tiles.openfreemap.org/styles/bright" },
    ];
  }
}
