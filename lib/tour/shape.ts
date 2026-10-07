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

/** Minutes of walking between one stop and the next, by pace. */
export const WALK_MINUTES: Record<Pace, number> = {
  relaxed: 4,
  steady: 6,
  "cover-ground": 9,
};

/** Walking speed by pace, for the distance estimate only. */
const KM_PER_HOUR: Record<Pace, number> = {
  relaxed: 3.5,
  steady: 4.5,
  "cover-ground": 5,
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
  const km = Math.max(0.5, Math.round(((walking / 60) * KM_PER_HOUR[req.pace]) * 2) / 2);
  return { stops, listening, walking, km };
}
