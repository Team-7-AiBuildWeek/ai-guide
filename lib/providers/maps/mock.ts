/**
 * Mock map provider. No key, no network.
 *
 * Tiles come from OpenFreeMap, which serves a MapLibre style with no key and
 * no account, so the map on screen is real even with everything mocked.
 * Geocoding and routing are local: a handful of real old-town landmarks and a
 * straight-line route between them.
 */

import type { LatLng, Place, WalkingRoute, MapStyle } from "@/lib/providers/types";
import { straightLineRoute, type MapProvider, type GeocodeOptions } from "./index";

const LANDMARKS: Place[] = [
  { id: "michalska-brana", name: "Michalská brána", address: "Michalská, 811 01 Bratislava", lat: 48.1447, lng: 17.1063 },
  { id: "hlavne-namestie", name: "Hlavné námestie", address: "Hlavné námestie, 811 01 Bratislava", lat: 48.1431, lng: 17.1082 },
  { id: "primacialny-palac", name: "Primaciálny palác", address: "Primaciálne námestie 1, Bratislava", lat: 48.1428, lng: 17.109 },
  { id: "stara-radnica", name: "Stará radnica", address: "Hlavné námestie 1, Bratislava", lat: 48.1435, lng: 17.1079 },
  { id: "modry-kostol", name: "Modrý kostol", address: "Bezručova 2, 811 09 Bratislava", lat: 48.1441, lng: 17.1152 },
  { id: "bratislavsky-hrad", name: "Bratislavský hrad", address: "Zámocká, 811 06 Bratislava", lat: 48.1421, lng: 17.1002 },
  { id: "hlavna-stanica", name: "Bratislava hlavná stanica", address: "Námestie Franza Liszta 1, Bratislava", lat: 48.1585, lng: 17.1065 },
  { id: "sng", name: "Slovenská národná galéria", address: "Riečna 1, 815 13 Bratislava", lat: 48.1401, lng: 17.1093 },
];

/** Ignores diacritics so "michalska" finds "Michalská". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export class MockMapProvider implements MapProvider {
  readonly name = "mock";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async geocode(query: string, _opts?: GeocodeOptions): Promise<Place[]> {
    const q = fold(query.trim());
    if (!q) return [];
    const hits = LANDMARKS.filter(
      (p) => fold(p.name).includes(q) || fold(p.address).includes(q),
    );
    // Never return an empty list for a non-empty query — the autocomplete in
    // step 3 needs something to show while it's being built.
    return hits.length > 0 ? hits : LANDMARKS.slice(0, 3);
  }

  async reverseGeocode(lat: number, lng: number): Promise<Place> {
    let best = LANDMARKS[0];
    let bestDist = Infinity;
    for (const p of LANDMARKS) {
      const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return {
      id: `pin-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      name: `Near ${best.name}`,
      address: best.address,
      lat,
      lng,
    };
  }

  async walkingRoute(points: LatLng[]): Promise<WalkingRoute> {
    return straightLineRoute(points);
  }

  tileStyleUrl(): string {
    return this.styles()[0].url;
  }

  /** OpenFreeMap serves these without a key, so the mock gets a switcher too. */
  styles(): MapStyle[] {
    return [
      { id: "liberty", label: "Map", url: "https://tiles.openfreemap.org/styles/liberty" },
      { id: "bright", label: "Bright", url: "https://tiles.openfreemap.org/styles/bright" },
      { id: "positron", label: "Pale", url: "https://tiles.openfreemap.org/styles/positron" },
    ];
  }
}
