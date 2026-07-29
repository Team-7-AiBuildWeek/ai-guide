/**
 * Put every stop where it actually is.
 *
 * A language model gives plausible coordinates, not correct ones — measured at
 * 11–183 m out on a real tour, which in an old town is the wrong side of a
 * square or the wrong building entirely. So the names it returns are looked up
 * against real map data and the coordinates replaced.
 *
 * Server-side: it needs the map provider.
 */

import type { MapProvider } from "@/lib/providers/maps";
import { haversine } from "@/lib/providers/maps";
import type { Stop } from "@/lib/providers/types";

/** How far from the start a stop may plausibly be on a walking tour. */
const SEARCH_RADIUS_KM = 3;

/**
 * How far a geocoded match may sit from the model's guess before it is
 * treated as a different place with the same name. Generous enough to fix a
 * wrong building, tight enough not to teleport the stop across the city.
 */
const MAX_CORRECTION_M = 600;

export type SnapResult = {
  stops: Stop[];
  corrected: number;
  unmatched: string[];
};

export async function snapStopsToRealPlaces(
  maps: MapProvider,
  stops: Stop[],
  near: { lat: number; lng: number },
): Promise<SnapResult> {
  const bounds = { lat: near.lat, lng: near.lng, radiusKm: SEARCH_RADIUS_KM };
  let corrected = 0;
  const unmatched: string[] = [];

  const out = await Promise.all(
    stops.map(async (stop) => {
      // The local name first: it is what the map data is indexed by.
      const queries = [stop.localName, stop.name].filter(
        (q): q is string => !!q?.trim(),
      );

      for (const query of queries) {
        let places;
        try {
          // "precise" matters more than it looks: without it "Stephansdom"
          // matches the Vienna district of that name and moves the cathedral
          // 439m up the road.
          places = await maps.geocode(query, { bounds, kind: "precise" });
        } catch {
          continue; // a lookup failure is not a reason to lose the stop
        }
        if (!places?.length) continue;

        // Nearest to where the model thought it was — among candidates that
        // are already confined to the search circle.
        const best = places.reduce((a, b) =>
          haversine(stop, a) <= haversine(stop, b) ? a : b,
        );
        const moved = haversine(stop, best);
        if (moved > MAX_CORRECTION_M) continue;

        if (moved > 5) corrected++;
        return { ...stop, lat: best.lat, lng: best.lng };
      }

      unmatched.push(stop.localName ?? stop.name);
      return stop;
    }),
  );

  return { stops: out, corrected, unmatched };
}
