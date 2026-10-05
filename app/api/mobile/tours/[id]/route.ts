/**
 * For the iPhone app: everything a recorded tour needs to run offline.
 *
 * Stops in order with coordinates and trigger radius, transcripts, walking
 * directions, and signed links to each recording. The links expire within the
 * day, so the app downloads every MP3 straight away and then needs no network.
 */

import { BackendError, backendReadyBundle } from "@/lib/backend/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tourId = Number(id);
  if (!Number.isInteger(tourId) || tourId <= 0) {
    return Response.json({ error: "Unknown tour." }, { status: 404 });
  }
  try {
    const bundle = await backendReadyBundle(tourId);
    return Response.json(bundle, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof BackendError && (err.status === 404 || err.status === 409)) {
      return Response.json({ error: err.status === 404 ? "Unknown tour." : "This tour is still being recorded." },
        { status: err.status });
    }
    return Response.json({ error: "The tour is unavailable right now." }, { status: 502 });
  }
}
