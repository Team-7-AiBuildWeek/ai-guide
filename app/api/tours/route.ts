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

import { after } from "next/server";
import { kickWorker } from "@/lib/backend/client";
import { backendPlanFor, backendStopWhenReady } from "@/lib/backend/tours";
import { normaliseLang } from "@/lib/i18n/languages";
import { getLLM, getMaps } from "@/lib/providers/factory";
import type { StopScript, TourPlan, TourRequest, TourRide } from "@/lib/providers/types";
import { findRides, routeWithRides } from "@/lib/tour/rides";
import { snapStopsToRealPlaces } from "@/lib/tour/snapStops";
import { orderStops, walkLength } from "@/lib/tour/order";
import { writeStopScript } from "@/lib/tour/scriptCache";
import { spend } from "@/lib/rateLimit";
import { saveTour } from "@/lib/tour/saved";
import { treatmentFor } from "@/lib/billing/mode";
import { planSigValid, signPlan } from "@/lib/billing/planSig";
import {
  consumeWalk,
  markDelivered,
  recordShadowWalk,
  refundWalk,
  walkStatus,
  whoIs,
  type PaywallReason,
} from "@/lib/billing/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** How long the first stop's narration may hold up the whole tour. */
const FIRST_SCRIPT_BUDGET_MS = 40_000;
/** How long to wait for walk-backend to finish recording the first stop. */
const FIRST_RECORDING_WAIT_MS = 12_000;

type Phase = "stops" | "locating" | "ordering" | "route" | "writing" | "done" | "error";

/**
 * The itinerary, sent the moment the model returns it.
 *
 * Everything after this point — checking the stops against the map, ordering
 * them, routing, writing the first narration — takes the bulk of the wait and
 * changes none of the names. So the walker can be reading what their walk is
 * about while the rest of it is being built, instead of watching three lines
 * of progress. It costs nothing to produce: this is the plan we already have.
 *
 * Names and angles only. Coordinates at this point are the model's guesses and
 * the order is not yet the walking order, so anything positional would be
 * shown wrong and then silently corrected.
 */
type Preview = {
  title: string;
  summary: string;
  stops: { name: string; angle: string }[];
};

type TourEvent = {
  phase: Phase;
  message?: string;
  data?: unknown;
  preview?: Preview;
  /**
   * The first piece the phone will speak of the first stop, sent the moment it
   * is written and before the rest of that stop is. The phone starts voicing it
   * straight away, so it is ready when the walk begins.
   */
  opening?: string;
  /** Set on an error that is the paywall, not a failure: the app shows the paywall instead. */
  paywall?: { reason: PaywallReason };
};

/** No walk left to build with — said as the paywall, not as a failed build. */
class PaywallStop extends Error {
  constructor(readonly reason: PaywallReason) {
    super(PAYWALL_WORDS[reason]);
  }
}

const PAYWALL_WORDS: Record<PaywallReason, string> = {
  signin_for_free: "Sign in to get your free walk.",
  signin: "You've used your free walk. Sign in to get more walks.",
  no_walks: "You've used your walks. Get more to build another.",
  fair_use_pass: "That's today's three walks on your pass. More tomorrow.",
  fair_use_annual: "That's this month's walks on your plan.",
};

/**
 * Old walks in people's history have no signature. Until this date they are
 * still walked again without one (and logged), so nobody loses a walk they
 * already have the day the paywall goes on.
 */
function legacyReplayAllowed(): boolean {
  const until = Date.parse(process.env.PAYWALL_LEGACY_REPLAY_UNTIL ?? "");
  return Number.isNaN(until) || Date.now() < until;
}

function sse(event: TourEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  let req: TourRequest;
  /**
   * An itinerary the caller already has, to be walked again rather than
   * chosen again.
   *
   * When it is here, the model is not asked for stops at all: the same brief
   * twice gives two different walks, and a walker repeating one in another
   * language means *that* one. The stops arrive already snapped to real
   * places and already in walking order, so the two passes that do that are
   * skipped with them — leaving the route and the first narration, which are
   * the parts that genuinely differ.
   */
  let given: TourPlan | null = null;
  /** The signature that came with `given`, from when it was first built. */
  let givenSig: string | undefined;
  try {
    const body = (await request.json()) as TourRequest & { plan?: TourPlan; planSig?: string };
    const { plan, planSig, ...rest } = body;
    req = rest as TourRequest;
    given = plan ?? null;
    givenSig = planSig;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!req?.start) {
    return Response.json({ error: "A starting point is required." }, { status: 400 });
  }
  if (given && !given.stops?.length) {
    return Response.json({ error: "A tour to walk again needs its stops." }, { status: 400 });
  }
  // An unknown code would otherwise reach the prompt verbatim and be written in.
  req.lang = normaliseLang(req.lang);

  /**
   * The paywall (lib/billing). Only a fresh itinerary is a walk: walking one
   * again and walks the backend already recorded cost nothing, so they are
   * never stopped — but a walk-again must be one this server handed out.
   */
  const who = await whoIs(request.headers);
  const treatment = who ? await treatmentFor(who.userId) : "off";
  if (given && treatment === "enforce" && !(await planSigValid(given.stops, givenSig))) {
    if (!legacyReplayAllowed()) {
      return Response.json({ error: "This walk can't be walked again — build it fresh." }, { status: 403 });
    }
    console.warn("[paywall] unsigned walk-again accepted (legacy grace period)");
  }
  /** Looked up early only when the paywall would stop a fresh build: a recorded walk is still free. */
  let early: Awaited<ReturnType<typeof backendPlanFor>> | undefined;
  if (!given && who && treatment === "enforce") {
    const status = await walkStatus(who);
    if (!status.canWalk) {
      early = await backendPlanFor(req);
      if (!early) {
        return Response.json(
          { error: PAYWALL_WORDS[status.reason ?? "no_walks"], paywall: { reason: status.reason ?? "no_walks" } },
          { status: 402 },
        );
      }
    }
  }
  /** The walk this build is booked as, once the paid work starts. */
  let walkId: string | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let lastPhase: Phase = "stops";
      const send = (e: TourEvent) => {
        lastPhase = e.phase;
        controller.enqueue(sse(e));
      };

      try {
        const llm = getLLM();
        const maps = getMaps();

        let plan: TourPlan;
        // Pre-recorded stops from walk-backend, when it serves this brief.
        // Null means "write it live", which is also what any backend failure means.
        const recorded = given ? null : early !== undefined ? early : await backendPlanFor(req);
        if (recorded) {
          plan = recorded.plan;
          // Keep recording the rest of the walk after this response has gone.
          if (recorded.status === "pending") after(() => kickWorker(10));
          const ready = plan.stops.filter((s) => s.audio).length;
          send({
            phase: "stops",
            message:
              ready === plan.stops.length
                ? `${plan.stops.length} stops, all recorded`
                : `${plan.stops.length} stops · ${ready} already recorded`,
            preview: {
              title: plan.title,
              summary: plan.summary,
              stops: plan.stops.map((s) => ({ name: s.name, angle: s.angle })),
            },
          });
          // Real places from the map data, already in walking order from where
          // the walker stands: there is nothing to snap and nothing to reorder.
        } else if (given) {
          // Nothing to choose and nothing to check: these stops have been
          // walked before, at coordinates the map already agreed with.
          plan = given;
          send({
            phase: "stops",
            message: `The same ${plan.stops.length} stops`,
            preview: {
              title: plan.title,
              summary: plan.summary,
              stops: plan.stops.map((s) => ({ name: s.name, angle: s.angle })),
            },
          });
        } else {
          send({ phase: "stops", message: "Choosing your stops" });
          // The walk is taken before the paid call and given back if the
          // build fails (the catch below). In shadow mode it is only booked.
          if (who && treatment !== "off") {
            const id = crypto.randomUUID();
            if (treatment === "shadow") {
              await recordShadowWalk(who, id).catch((err) => console.error("[paywall] shadow booking failed:", err));
              walkId = id;
            } else {
              const source = await consumeWalk(who, id, treatment);
              if (!source) {
                // Lost a race for the last walk since the check above.
                const status = await walkStatus(who);
                throw new PaywallStop(status.reason ?? "no_walks");
              }
              walkId = id;
            }
          }
          // The paid call. Over the limit, this throws a plain sentence that
          // reaches the walker as the build's error (see the catch below).
          await spend(request.headers, "tour");
          plan = await llm.generateTourPlan(req);
          send({
            phase: "stops",
            message: `${plan.stops.length} stops chosen`,
            preview: {
              title: plan.title,
              summary: plan.summary,
              stops: plan.stops.map((s) => ({ name: s.name, angle: s.angle })),
            },
          });

          // The model's coordinates are plausible, not correct. Look each stop
          // up on the real map before anything is drawn, routed or reordered.
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

          // Now the coordinates are real, put them in walking order — before
          // the narration is written, because the cues describe the previous
          // stop.
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
        }

        /**
         * The first stop's narration, started now rather than after the route.
         *
         * It does not depend on trams or routing, and it is the longest wait in
         * the whole build (25–28 s measured), so it runs alongside them. Its
         * opening is passed to the phone the moment it is written.
         */
        const firstStop = plan.stops[0];
        const firstStarted = Date.now();
        const firstScript: Promise<StopScript | null> | null =
          firstStop.script || firstStop.backend
            ? null
            : writeStopScript({
                req,
                stop: firstStop,
                previous: null,
                position: 1,
                total: plan.stops.length,
                onOpening: (opening) => send({ phase: lastPhase, opening }),
              }, { beforeWrite: () => spend(request.headers, "script") }).catch(() => null); // not fatal: the phone asks again for anything missing

        const points = [
          { lat: req.start.lat, lng: req.start.lng },
          ...plan.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
          ...(req.end ? [{ lat: req.end.lat, lng: req.end.lng }] : []),
        ];

        /**
         * Which gaps are ridden rather than walked.
         *
         * Before the routing, because it decides what there is to route: a gap
         * with a tram across it is two short walks and a jump, not one long
         * march. Returns nothing at all when the city has no transit mapped,
         * when nothing useful joins the stops, or when the lookup runs out of
         * time — all of which mean the same thing here, which is walk.
         */
        send({ phase: "route", message: "Looking for a way across" });
        let rides: TourRide[] = [];
        try {
          rides = await findRides(points);
          if (rides.length > 0) {
            const lines = rides.map((r) => `${r.mode} ${r.ref}`).join(" · ");
            send({ phase: "route", message: `Riding part of it — ${lines}` });
          }
        } catch {
          // Overpass being unreachable is a walk, not a failure.
        }

        send({ phase: "route", message: "Planning the walking route" });

        let route: GeoJSON.Feature | null = null;
        let meters = 0;
        let seconds = 0;
        let maneuvers: unknown[] = [];
        try {
          const r = await routeWithRides(maps, points, rides);
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
        // losing the connection costs everything. The clock started when the
        // writing did, alongside the routing above.
        if (firstScript) {
          send({ phase: "writing", message: "Writing the first stop" });
          const left = Math.max(0, FIRST_SCRIPT_BUDGET_MS - (Date.now() - firstStarted));
          const script = await Promise.race([
            firstScript,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), left)),
          ]);
          if (script) plan.stops[0] = { ...firstStop, ...script };
          // The losing call is not cancelled on purpose: it finishes into the
          // script cache, so the client's own request for it is a cache hit.
        } else if (!firstStop.script && firstStop.backend) {
          // A recorded first stop still being recorded gets a short wait — far
          // cheaper than writing and voicing it live — and is written live by
          // the phone only if the recording does not arrive in time.
          send({ phase: "writing", message: "Collecting the first recording" });
          const ready = await backendStopWhenReady(firstStop.backend, req.lang, FIRST_RECORDING_WAIT_MS);
          if (ready) plan.stops[0] = { ...firstStop, ...ready };
        }

        // Signed for every path, so any walk handed out can be walked again.
        const planSig = await signPlan(plan.stops);
        if (walkId) {
          await markDelivered(walkId, plan, req, meters, rides).catch((err) =>
            console.error("[paywall] could not mark the walk delivered:", err),
          );
        }
        send({ phase: "done", data: { plan, route, meters, seconds, maneuvers, rides, walkId, planSig } });
        // Kept, once the walker has it: every tour goes in the database, so any
        // of them can be played back later (the demo tour is one). A plan that
        // arrived with all its words is a replay, already kept.
        if (!plan.stops.every((s) => s.script)) {
          const built = { plan, route, meters, seconds, maneuvers, rides, req };
          after(() => saveTour(built));
        }
      } catch (err) {
        // Nothing was delivered: whatever walk this was booked as goes back.
        if (walkId) await refundWalk(walkId).catch((e) => console.error("[paywall] refund failed:", e));
        try {
          send({
            phase: "error",
            message: err instanceof Error ? err.message : "Could not build the tour.",
            ...(err instanceof PaywallStop ? { paywall: { reason: err.reason } } : {}),
          });
        } catch {
          // The walker has gone (the stream was cancelled); the refund above is what mattered.
        }
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
