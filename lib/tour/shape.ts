/**
 * The shape of a walk from its three settings: how many stops, how long at
 * each, how long between them.
 *
 * One calculation, read by the planner (how many stops to ask the model for)
 * and by "Build my tour" (the estimate above the button), so what the screen
 * promises is the walk that gets planned. Plain numbers, no prompt text, so
 * the screen can import it without shipping the prompts to the browser.
 */

import type { Detail, Pace, TourRequest } from "@/lib/providers/types";

type Settings = Pick<TourRequest, "durationMinutes" | "detail" | "pace">;

/** Every stop is four to five minutes now; detail decides what fills them. */
export const SCRIPT_MINUTES: Record<Detail, number> = {
  highlights: 4,
  story: 4.5,
  everything: 5,
};

/**
 * How fast each pace walks, in metres per second.
 *
 * Pace is walking speed — that is what the word means to the person choosing
 * it. It used to mean spacing: "Fast" (internally "cover-ground") put the
 * stops further apart, nine minutes between them against Relaxed's four, so
 * choosing Fast made the gaps longer, which read as broken.
 *
 * Sightseeing speeds, well under a router's ~1.4 m/s for someone with
 * somewhere to be: 3.6, 4.3 and 5 km/h. Shared with lib/tour/timing.ts, so the
 * estimate on the setup screen and the time given for the planned walk agree.
 */
export const WALK_SPEED_MPS: Record<Pace, number> = {
  relaxed: 1.0,
  steady: 1.2,
  "cover-ground": 1.4,
};

/**
 * How far apart stops are on foot, whatever the pace: a few minutes'
 * stroll in a city centre. A faster walker reaches the next one sooner,
 * which is what leaves room for more stops in the same time.
 */
export const STOP_SPACING_M = 420;

/** Minutes of walking between one stop and the next, by pace: 7, 6 and 5. */
export const WALK_MINUTES: Record<Pace, number> = {
  relaxed: Math.round(STOP_SPACING_M / (WALK_SPEED_MPS.relaxed * 60)),
  steady: Math.round(STOP_SPACING_M / (WALK_SPEED_MPS.steady * 60)),
  "cover-ground": Math.round(STOP_SPACING_M / (WALK_SPEED_MPS["cover-ground"] * 60)),
};

/**
 * How many stops actually fit in the time asked for.
 *
 * The old version was a flat "stops per hour" that ignored how long anyone
 * stands at a stop, so an afternoon returned the same six stops as an hour.
 * A stop costs its narration plus the walk to the next one, and that is the
 * whole calculation.
 */
export function stopCount(req: Settings): number {
  const perStop = SCRIPT_MINUTES[req.detail] + WALK_MINUTES[req.pace];
  return Math.max(3, Math.round(req.durationMinutes / perStop));
}

/** The shape of the time budget, for the prompt and for the UI. */
export function tourShape(req: Settings) {
  const stops = stopCount(req);
  const listening = Math.round(stops * SCRIPT_MINUTES[req.detail]);
  const walking = Math.max(0, req.durationMinutes - listening);
  // To the nearest half kilometre: an estimate, and it should read like one.
  const km = Math.max(0.5, Math.round(((walking * 60 * WALK_SPEED_MPS[req.pace]) / 1000) * 2) / 2);
  return { stops, listening, walking, km };
}
