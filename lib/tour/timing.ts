/**
 * How long a walk actually takes.
 *
 * The number on the headphones screen used to be the router's walking time and
 * nothing else, which is wrong twice over.
 *
 * It left out the stops. A tour is not a commute — the walker stands still at
 * every stop for four or five minutes of narration, and on a six-stop walk
 * that is half an hour missing from a number presented as the whole thing.
 *
 * And its walking half was a commuter's. Valhalla's pedestrian model runs at
 * about 5 km/h: someone going somewhere. A tourist with headphones in an old
 * town does not do 5 km/h. They look up, cross with the lights, wait behind a
 * tour group, stop to photograph a door. Measured tours came back saying six
 * kilometres and six stops would take seventy-five minutes, which is not a
 * thing a person can do.
 */

import type { Detail, Pace } from "@/lib/providers/types";
import { spokenMinutes } from "@/lib/prompts/tour-plan";
import type { StoredTour } from "./flow";

/**
 * Metres per second, actually walked, by the pace the walker asked for.
 *
 * Well under Valhalla's ~1.4 m/s, because that figure is for someone with
 * somewhere to be. These are sightseeing speeds: 3.6, 4.3 and 5 km/h. Even
 * the fastest is a brisk stroll rather than a commute, because whatever the
 * setting says, this is still a walk with a voice in your ear.
 */
const SPEED_MPS: Record<Pace, number> = {
  relaxed: 1.0,
  steady: 1.2,
  "cover-ground": 1.4,
};

const DEFAULT_PACE: Pace = "steady";
const DEFAULT_DETAIL: Detail = "story";

export type TourTiming = {
  /** Seconds spent moving. */
  walking: number;
  /** Seconds spent standing at a stop, listening. */
  listening: number;
  /** What the walker should be told. */
  total: number;
};

/**
 * Split a tour into the time spent walking and the time spent listening.
 *
 * Distance comes from the real route, so it is trustworthy; the speed is ours
 * because the router's is not a tourist's. Listening is the narration each
 * stop was written to, which is a target rather than a measurement — the
 * scripts mostly do not exist yet at the moment this number is shown, and a
 * plan for four and a half minutes lands close enough to four and a half.
 */
export function tourTiming(tour: StoredTour): TourTiming {
  const pace = tour.req?.pace ?? DEFAULT_PACE;
  const detail = tour.req?.detail ?? DEFAULT_DETAIL;

  // Falls back to the router's own seconds when there is no distance to work
  // from — a tour whose routing failed still has to say something.
  const walking = tour.meters > 0 ? Math.round(tour.meters / SPEED_MPS[pace]) : tour.seconds;
  const listening = Math.round(tour.plan.stops.length * spokenMinutes(detail) * 60);

  return { walking, listening, total: walking + listening };
}

/** The one number a walker is given, in whole minutes. */
export function tourMinutes(tour: StoredTour): number {
  return Math.max(1, Math.round(tourTiming(tour).total / 60));
}
