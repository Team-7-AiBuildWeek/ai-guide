/**
 * Build a tour, reporting real progress.
 *
 * Server-sent events rather than a long POST, because generation takes tens of
 * seconds and the status lines on screen have to be true — each one is emitted
 * when that stage actually starts, not on a timer.
 *
 * Only the itinerary is written here. The narration for each stop comes later,
 * one stop at a time, from /api/stops/script: a four-hour walk is twenty or
 * more stops of five-minute narration, which is both a five-minute wait and
 * well past every serverless time limit there is. The first stop is the
 * exception — it is needed the moment the walk begins, so it is written here
 * while the walker is still reading the summary.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getLLM, getMaps } from "@/lib/providers/factory";
import type { TourRequest } from "@/lib/providers/types";
import { snapStopsToRealPlaces } from "@/lib/tour/snapStops";
import { orderStops, walkLength } from "@/lib/tour/order";
import { writeStopScript } from "@/lib/tour/scriptCache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** How long the first stop's narration may hold up the whole tour. */
const FIRST_SCRIPT_BUDGET_MS = 40_000;

type Phase = "stops" | "locating" | "ordering" | "route" | "writing" | "done" | "error";

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
  // An unknown code would otherwise reach the prompt verbatim and be written in.
  req.lang = normaliseLang(req.lang);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: { phase: Phase; message?: string; data?: unknown }) =>
        controller.enqueue(sse(e));

      try {
        const llm = getLLM();
        const maps = getMaps();

        send({ phase: "stops", message: "Choosing your stops" });
        const plan = await llm.generateTourPlan(req);
        send({ phase: "stops", message: `${plan.stops.length} stops chosen` });

        // The model's coordinates are plausible, not correct. Look each stop up
        // on the real map before anything is drawn, routed or reordered.
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

        // Now the coordinates are real, put them in walking order — before the
        // narration is written, because the cues describe the previous stop.
        send({ phase: "ordering", message: "Putting them in walking order" });
        const before = walkLength(plan.stops, req.start, req.end);
        plan.stops = orderStops(plan.stops, req.start, req.end);
        const after = walkLength(plan.stops, req.start, req.end);
        if (after < before - 50) {
          send({
            phase: "ordering",
            message: `Reordered — about ${Math.round((before - after) / 50) * 50} m less walking`,
          });
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

        // The first stop's narration, so the walk can begin the moment the
        // headphones screen is dismissed. The rest are fetched as they come up.
        //
        // Raced against a clock rather than simply awaited: one measured run
        // spent 110s here on top of a 68s itinerary, which is past the point
        // where a serverless host cuts the connection and the walker gets no
        // tour at all. Losing the race costs a wait on the headphones screen;
        // losing the connection costs everything.
        send({ phase: "writing", message: "Writing the first stop" });
        try {
          const first = plan.stops[0];
          const script = await Promise.race([
            writeStopScript({
              req,
              stop: first,
              previous: null,
              position: 1,
              total: plan.stops.length,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_SCRIPT_BUDGET_MS)),
          ]);
          if (script) plan.stops[0] = { ...first, ...script };
          // The losing call is not cancelled on purpose: it finishes into the
          // script cache, so the client's own request for it is a cache hit.
        } catch {
          // Not fatal: the client asks again for anything it finds missing.
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
