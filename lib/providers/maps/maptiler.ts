/** MapTiler: tiles + geocoding. Routing falls back to a straight line — MapTiler has no routing API. */

import { config, requireKey } from "@/lib/config";
import {
  ProviderError,
  type LatLng,
  type MapStyle,
  type Place,
  type WalkingRoute,
} from "@/lib/providers/types";
import { straightLineRoute, type MapProvider } from "./index";

const GEOCODE = "https://api.maptiler.com/geocoding";

type MapTilerResponse = {
  features: Array<{
    id: string;
    text?: string;
    place_name?: string;
    center: [number, number];
  }>;
};

function toPlaces(body: MapTilerResponse): Place[] {
  return body.features.map((f) => ({
    id: f.id,
    name: f.text ?? f.place_name ?? "Unnamed",
    address: f.place_name ?? f.text ?? "",
    lat: f.center[1],
    lng: f.center[0],
  }));
}

export class MapTilerMapProvider implements MapProvider {
  readonly name = "maptiler";

  private key(): string {
    return requireKey(config.maptilerApiKey, "MAPTILER_API_KEY", "maptiler");
  }

  async geocode(query: string): Promise<Place[]> {
    const url = `${GEOCODE}/${encodeURIComponent(query)}.json?key=${this.key()}&limit=6&language=sk,en`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    return toPlaces((await res.json()) as MapTilerResponse);
  }

  async reverseGeocode(lat: number, lng: number): Promise<Place> {
    const url = `${GEOCODE}/${lng},${lat}.json?key=${this.key()}&limit=1&language=sk,en`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    const places = toPlaces((await res.json()) as MapTilerResponse);
    if (places.length === 0) {
      return { id: `pin-${lat},${lng}`, name: "Dropped pin", address: "", lat, lng };
    }
    return { ...places[0], lat, lng };
  }

  async walkingRoute(points: LatLng[]): Promise<WalkingRoute> {
    // MapTiler does not route. Set MAP_PROVIDER=osm if the drawn path matters.
    return straightLineRoute(points);
  }

  tileStyleUrl(): string {
    return this.styles()[0].url;
  }

  styles(): MapStyle[] {
    const url = (m: string) => `https://api.maptiler.com/maps/${m}/style.json?key=${this.key()}`;
    return [
      { id: "streets-v2", label: "Map", url: url("streets-v2") },
      { id: "satellite", label: "Satellite", url: url("satellite") },
      { id: "outdoor-v2", label: "Outdoors", url: url("outdoor-v2") },
    ];
  }
}
