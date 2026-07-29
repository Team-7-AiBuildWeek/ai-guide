/** Mapbox: tiles, geocoding and walking directions. */

import { config, requireKey } from "@/lib/config";
import {
  ProviderError,
  type LatLng,
  type MapStyle,
  type Place,
  type WalkingRoute,
} from "@/lib/providers/types";
import type { MapProvider } from "./index";

const GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";

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

  async geocode(query: string): Promise<Place[]> {
    const url =
      `${GEOCODE}/${encodeURIComponent(query)}.json` +
      `?access_token=${this.token()}&limit=6&language=sk,en&country=sk`;
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

  async reverseGeocode(lat: number, lng: number): Promise<Place> {
    const url = `${GEOCODE}/${lng},${lat}.json?access_token=${this.token()}&limit=1&language=sk,en`;
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
