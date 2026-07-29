/**
 * Build a tour, reporting real progress.
 *
 * Server-sent events rather than a long POST, because generation can take
 * 30–60 seconds and the status lines on screen have to be true — each one is
 * emitted when that stage actually starts, not on a timer.
 */

import { getLLM, getMaps } from "@/lib/providers/factory";
import type { TourRequest } from "@/lib/providers/types";
import { snapStopsToRealPlaces } from "@/lib/tour/snapStops";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Phase = "stops" | "locating" | "route" | "done" | "error";

function sse(event: { phase: Phase; message?: string; data?: unknown }): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  let req: TourRequest;
  try {
    req = (await request.json()) as TourRequest;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!req?.start) {
    return Response.json({ error: "A starting point is required." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: { phase: Phase; message?: string; data?: unknown }) =>
        controller.enqueue(sse(e));

      try {
        send({ phase: "stops", message: "Choosing your stops" });
        const plan = await getLLM().generateTourPlan(req);

        const maps = getMaps();

        // The model's coordinates are plausible, not correct. Look each stop up
        // on the real map before anything is drawn or routed.
        send({ phase: "locating", message: "Checking the stops against the map" });
        try {
          const snapped = await snapStopsToRealPlaces(maps, plan.stops, req.start);
          plan.stops = snapped.stops;
          if (snapped.unmatched.length) {
            send({
              phase: "locating",
              message: `${snapped.corrected} placed exactly · ${snapped.unmatched.length} kept as estimated`,
            });
          }
        } catch {
          // Estimated coordinates beat no tour.
        }

        send({ phase: "route", message: "Planning the walking route" });
        const points = [
          { lat: req.start.lat, lng: req.start.lng },
          ...plan.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
          ...(req.end ? [{ lat: req.end.lat, lng: req.end.lng }] : []),
        ];

        let route: GeoJSON.Feature | null = null;
        let meters = 0;
        let seconds = 0;
        let maneuvers: unknown[] = [];
        try {
          const r = await maps.walkingRoute(points);
          route = r.geojson as unknown as GeoJSON.Feature;
          meters = r.meters;
          seconds = r.seconds;
          maneuvers = r.maneuvers;
        } catch {
          // A missing line is a worse tour, not a failed one. Carry on.
          send({ phase: "route", message: "Routing unavailable — showing stops only" });
        }

        send({ phase: "done", data: { plan, route, meters, seconds, maneuvers } });
      } catch (err) {
        send({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not build the tour.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
