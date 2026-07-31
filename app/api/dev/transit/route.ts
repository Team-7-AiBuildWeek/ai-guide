/**
 * Ride lookup, for the bench.
 *
 * Development aid — gate or delete it before the app is public. It exists
 * because a transit leg is the one part of a tour that cannot be checked by
 * reading the code: either tram 3 goes there or it does not.
 */

import { findRide } from "@/lib/providers/transit/osm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const n = (k: string) => Number(u.searchParams.get(k));
  const from = { lat: n("fromLat"), lng: n("fromLng") };
  const to = { lat: n("toLat"), lng: n("toLng") };
  for (const p of [from.lat, from.lng, to.lat, to.lng]) {
    if (!Number.isFinite(p)) {
      return Response.json({ error: "fromLat, fromLng, toLat, toLng required." }, { status: 400 });
    }
  }
  const started = Date.now();
  const ride = await findRide(from, to);
  return Response.json({ ride, ms: Date.now() - started });
}
