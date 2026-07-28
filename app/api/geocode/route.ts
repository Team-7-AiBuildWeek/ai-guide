/**
 * Address lookup for the start/end inputs.
 *
 * Exists so the map key stays on the server: the browser talks to us, we talk
 * to the provider. Reverse geocoding shares the route — pass lat/lng instead
 * of q to turn a dropped pin into an address.
 */

import { getMaps } from "@/lib/providers/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const maps = getMaps();

  try {
    if (lat && lng) {
      const place = await maps.reverseGeocode(Number(lat), Number(lng));
      return Response.json({ places: [place] });
    }
    if (!q || q.trim().length < 2) return Response.json({ places: [] });
    return Response.json({ places: await maps.geocode(q.trim()) });
  } catch (err) {
    return Response.json(
      { places: [], error: err instanceof Error ? err.message : "Lookup failed." },
      { status: 502 },
    );
  }
}
