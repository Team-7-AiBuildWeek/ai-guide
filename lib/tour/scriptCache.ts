/**
 * Writing one stop's narration, once.
 *
 * Shared by /api/stops/script and by /api/tours, which writes the first stop
 * itself so the walk can begin immediately. Sharing matters more than it
 * looks: /api/tours gives up on that call after forty seconds and sends the
 * tour without it, and the call it abandoned keeps running and lands here — so
 * the client's own request for the same stop is answered from memory instead
 * of paying for it a second time.
 */

import { createHash } from "crypto";
import { getLLM } from "@/lib/providers/factory";
import type { Stop, StopScript, TourRequest } from "@/lib/providers/types";

export type ScriptJob = {
  req: TourRequest;
  stop: Stop;
  previous?: Stop | null;
  position: number;
  total: number;
};

/**
 * Module scope, so it survives between requests on a warm server. Scripts are
 * a few kilobytes each, so this is cheap next to the audio cache — but still
 * bounded, because a long-lived server would otherwise hold every stop of
 * every tour it ever wrote.
 */
const CACHE = new Map<string, StopScript>();
const INFLIGHT = new Map<string, Promise<StopScript>>();
const MAX_ENTRIES = 400;

/** Everything that changes the words. The brief is in here: two walkers at the
 *  same stop asking for different things must not share a recording. */
function cacheKey(b: ScriptJob): string {
  return createHash("sha256")
    .update(
      [
        b.stop.id,
        b.stop.name,
        b.stop.lat.toFixed(4),
        b.stop.lng.toFixed(4),
        b.stop.angle,
        b.previous?.id ?? "start",
        b.position,
        b.total,
        b.req.lang,
        b.req.detail,
        b.req.pace,
        b.req.interests.join(","),
        b.req.city?.label ?? "",
        b.req.freeText ?? "",
      ].join("|"),
    )
    .digest("hex");
}

export function cachedScript(job: ScriptJob): StopScript | null {
  return CACHE.get(cacheKey(job)) ?? null;
}

export function writeStopScript(job: ScriptJob): Promise<StopScript> {
  const key = cacheKey(job);
  const hit = CACHE.get(key);
  if (hit) return Promise.resolve(hit);

  // Share one call between concurrent askers rather than paying twice.
  const running = INFLIGHT.get(key);
  if (running) return running;

  const job$ = getLLM()
    .generateStopScript({
      req: job.req,
      stop: job.stop,
      previous: job.previous ?? null,
      position: job.position,
      total: job.total,
    })
    .then((script) => {
      CACHE.set(key, script);
      while (CACHE.size > MAX_ENTRIES) {
        const oldest = CACHE.keys().next().value;
        if (oldest === undefined) break;
        CACHE.delete(oldest);
      }
      return script;
    })
    .finally(() => INFLIGHT.delete(key));

  INFLIGHT.set(key, job$);
  return job$;
}
