/**
 * Deciding which GPS readings to believe.
 *
 * A phone does not hand you one position, it hands you a stream of guesses of
 * wildly different quality: a cell-tower estimate 300 m wide, then a wifi
 * lookup, then — once the GPS chip has sky — something within a few metres. The
 * browser reports all of them the same way, so a walk that takes every reading
 * as truth teleports across the map and calls it movement.
 *
 * Two mechanisms, kept apart because they answer different questions:
 *  - `acceptReading` — is this reading worth having at all?
 *  - `smooth` — given that it is, where does it put us?
 *
 * Pure functions with no browser API in sight, so the rules can be reasoned
 * about, and so `useLiveLocation` stays a hook and nothing more.
 */

import { distanceMeters } from "./route";

export type Reading = {
  lat: number;
  lng: number;
  /** The device's own 68% confidence radius, in metres. */
  accuracy: number;
  at: number;
};

/**
 * Above this, a reading is a neighbourhood rather than a position — good
 * enough to centre a map on, not good enough to say you have arrived
 * somewhere. Set at 30 m because an old-town street is about that wide: a
 * fix that cannot tell which side of the street you are on cannot tell which
 * building you are standing in front of.
 */
export const TRUSTED_M = 30;

/**
 * Nothing better is coming: after this long without an accepted reading, take
 * whatever arrives. Without this escape a single very precise reading could
 * lock out every later one and the dot would stick forever.
 */
const STALE_MS = 20_000;

/** Running for a tram, not sitting in a car. Anything faster is not this walk. */
const MAX_WALK_MPS = 8;

/**
 * How much worse than what we already have a reading may be and still be worth
 * taking. Some drift is normal as satellites come and go; a jump from 8 m to
 * 200 m is the phone falling back to wifi.
 */
const TOLERATED_DECAY_M = 30;

/** Good enough to act on: to advance a stop, or to measure a turn. */
export function isTrusted(reading: Reading | null): reading is Reading {
  return !!reading && reading.accuracy <= TRUSTED_M;
}

/**
 * Why the radius is that wide, when it is wide enough to have one cause.
 *
 * Past a couple of hundred metres this is not weak GPS, it is no GPS: the
 * position came from wifi or the cell network. On a phone that usually means
 * precise location is switched off for the browser, which is a setting rather
 * than a fact about the sky, and worth saying out loud.
 */
export function accuracyHint(accuracy: number): string | null {
  if (accuracy <= 200) return null;
  return "That is a network lookup, not GPS. On a phone, check that precise location is allowed for this browser; a laptop has no GPS chip and positions by wifi.";
}

/** The word for a radius, for anywhere that shows one. */
export function qualityWord(accuracy: number): "Good" | "Fair" | "Poor" {
  if (accuracy <= 15) return "Good";
  if (accuracy <= TRUSTED_M) return "Fair";
  return "Poor";
}

/**
 * Whether to believe `next` given that `prev` is the last reading we believed.
 *
 * The order of these tests matters: staleness first, because a stuck dot is
 * worse than an imprecise one.
 */
export function acceptReading(prev: Reading | null, next: Reading): boolean {
  if (!prev) return true;

  const dtMs = next.at - prev.at;
  // Readings can arrive out of order after a suspend. An older one tells us
  // nothing we do not already know.
  if (dtMs < 0) return false;
  if (dtMs > STALE_MS) return true;

  if (next.accuracy > prev.accuracy + TOLERATED_DECAY_M) return false;

  /**
   * A move neither error circle can account for is not a walk.
   *
   * This applies to precise readings too, which is the whole point: a street
   * of tall buildings bounces the signal and produces readings that are a
   * hundred metres out and *confident* about it. Being sure is not the same as
   * being right, so precision alone does not buy a reading its way in.
   *
   * Both radii are allowed for, so a ±9 m fix genuinely correcting a ±200 m
   * wifi guess still gets through — there the circles overlap and the jump is
   * exactly what should happen.
   */
  const moved = distanceMeters(prev, next);
  const seconds = Math.max(dtMs / 1000, 1);
  return moved <= MAX_WALK_MPS * seconds + prev.accuracy + next.accuracy;
}

export type Smoothed = Reading & {
  /** The filter's own uncertainty, m². Internal — `accuracy` is what to show. */
  variance: number;
};

/**
 * How much motion the filter does not model, as a standard deviation in metres
 * per second.
 *
 * Deliberately more than a walking pace. The filter tracks position and not
 * velocity, so a walker moving steadily is, to it, entirely unexplained
 * motion — set this to 1.4 and the dot settles about five metres behind the
 * person, always, which is the difference between "turn here" and "you have
 * turned". At 3 the lag is about two metres, measured, and a wild reading
 * still moves the dot by only about one, because that rejection comes from
 * weighting by accuracy rather than from this number.
 */
const PROCESS_NOISE_MPS = 3;

/**
 * One step of a Kalman filter over the position.
 *
 * Each reading is weighted by how precise the device says it is against how
 * uncertain we already were, so a ±40 m reading nudges the dot while a ±5 m
 * one commands it. This is what stops the dot shivering while you stand still.
 *
 * `accuracy` on the way out stays the device's own number for the newest
 * reading, not the filter's posterior. The posterior is smaller and would look
 * better on screen, but averaging cannot remove a bias — a wifi lookup that is
 * confidently 80 m off stays 80 m off however many times you ask it — and a
 * circle that claims more than it knows is worse than a wide honest one.
 */
export function smooth(prev: Smoothed | null, next: Reading): Smoothed {
  if (!prev) return { ...next, variance: next.accuracy ** 2 };

  const seconds = Math.max(0, (next.at - prev.at) / 1000);
  // The longer the silence, the less the old estimate is worth.
  const predicted = prev.variance + seconds * PROCESS_NOISE_MPS ** 2;
  const gain = predicted / (predicted + next.accuracy ** 2);

  return {
    lat: prev.lat + gain * (next.lat - prev.lat),
    lng: prev.lng + gain * (next.lng - prev.lng),
    accuracy: next.accuracy,
    at: next.at,
    variance: (1 - gain) * predicted,
  };
}
