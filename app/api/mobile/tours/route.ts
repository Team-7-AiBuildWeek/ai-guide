/**
 * For the iPhone app: the ready-made tours near where the walker is.
 *
 * Read-only and recorded-only: nothing here can start generation, so nothing
 * here can spend money. The app never sees walk-backend's address or any key.
 */

import { BackendError, backendCityAt, backendEnabled, backendPremadeTours } from "@/lib/backend/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLat = url.searchParams.get("lat");
  const rawLng = url.searchParams.get("lng");
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  // Number(null) is 0: without this check a missing parameter searches the Gulf of Guinea.
  if (!rawLat || !rawLng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required" }, { status: 400 });
  }
  if (!backendEnabled()) return Response.json({ city: null, tours: [] });
  try {
    const city = await backendCityAt(lat, lng);
    if (!city) return Response.json({ city: null, tours: [] });
    const tours = await backendPremadeTours(city.id);
    return Response.json({
      city: { id: city.id, name: city.name, centroid: city.centroid },
      tours: tours.map((t) => ({
        id: t.id,
        theme: t.theme,
        language: t.language,
        stops: t.stops,
        minutes: Math.round((t.total_duration_ms ?? t.target_duration_min * 60_000) / 60_000),
        walkMeters: t.total_walk_m,
      })),
    });
  } catch (err) {
    const status = err instanceof BackendError && err.status ? 502 : 503;
    return Response.json({ error: "Tours are unavailable right now." }, { status });
  }
}
