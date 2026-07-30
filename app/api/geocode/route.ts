/**
 * Address lookup for the city and start/end inputs.
 *
 * Exists so the map key stays on the server: the browser talks to us, we talk
 * to the provider. Reverse geocoding shares the route — pass lat/lng instead
 * of q to turn a dropped pin, or a GPS fix, into somewhere with a name.
 *
 * `kind=city` is a different search rather than a filter on this one: it
 * ranges over the whole world and returns only settlements, because "which
 * city am I in" and "which corner of this square" are not the same question.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { GeocodeKind, GeocodeOptions } from "@/lib/providers/maps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const asked = url.searchParams.get("kind");
  const kind: GeocodeKind = asked === "city" ? "city" : asked === "precise" ? "precise" : "place";
  const nearLat = Number(url.searchParams.get("nearLat"));
  const nearLng = Number(url.searchParams.get("nearLng"));
  const radiusKm = Number(url.searchParams.get("radiusKm"));
  const maps = getMaps();

  // Labels come back in the walker's language when they asked for one. The
  // stops the model gives us are looked up server-side without it, on purpose:
  // those have to match what is written on the building.
  const asking = url.searchParams.get("lang");
  const opts: GeocodeOptions = { kind, ...(asking ? { lang: normaliseLang(asking) } : {}) };
  if (Number.isFinite(nearLat) && Number.isFinite(nearLng)) {
    // A radius means "nowhere else will do". Without one this is only a
    // ranking hint, which is what searching for a place inside a chosen city
    // wants — the city is a strong steer, not a wall.
    opts.focus = { lat: nearLat, lng: nearLng };
    if (Number.isFinite(radiusKm) && radiusKm > 0) {
      opts.bounds = { lat: nearLat, lng: nearLng, radiusKm };
    }
  }

  try {
    if (lat && lng) {
      const place = await maps.reverseGeocode(Number(lat), Number(lng), opts);
      return Response.json({ places: [place] });
    }
    if (!q || q.trim().length < 2) return Response.json({ places: [] });
    return Response.json({ places: await maps.geocode(q.trim(), opts) });
  } catch (err) {
    return Response.json(
      { places: [], error: err instanceof Error ? err.message : "Lookup failed." },
      { status: 502 },
    );
  }
}
