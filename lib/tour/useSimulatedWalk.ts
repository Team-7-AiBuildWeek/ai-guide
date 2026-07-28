"use client";

/**
 * A fake walker, for building the tour without being in Bratislava.
 *
 * Also the only way to work on this from a Mac that is wired rather than on
 * wifi: a Mac has no GPS chip and positions itself by looking up nearby wifi
 * access points, so with no association there is nothing to look up and every
 * browser reports POSITION_UNAVAILABLE.
 *
 * Emits the same shape as `watchPosition`, at a real walking pace, so the code
 * that consumes it cannot tell the difference.
 */

import { useEffect, useRef, useState } from "react";
import {
  OLD_TOWN_STOPS,
  WALKING_SPEED_MPS,
  distanceMeters,
  interpolate,
  type RoutePoint,
} from "./route";

export type SimulatedFix = {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
  /** Index of the stop just left. */
  legIndex: number;
  /** 0–1 along the whole route. */
  progress: number;
  done: boolean;
};

const TICK_MS = 1000;

export function useSimulatedWalk(
  active: boolean,
  {
    stops = OLD_TOWN_STOPS,
    speed = WALKING_SPEED_MPS,
    /** Multiplier so a 45-minute walk can be watched in a couple of minutes. */
    rate = 8,
  }: { stops?: RoutePoint[]; speed?: number; rate?: number } = {},
): SimulatedFix | null {
  const [fix, setFix] = useState<SimulatedFix | null>(null);
  const travelledRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Reset the odometer, but do not write state here — the hook derives its
      // return value from `active` instead, so stopping costs no extra render.
      travelledRef.current = 0;
      return;
    }

    const legs = stops.slice(1).map((stop, i) => ({
      from: stops[i],
      to: stop,
      meters: distanceMeters(stops[i], stop),
    }));
    const total = legs.reduce((sum, l) => sum + l.meters, 0);

    const id = window.setInterval(() => {
      travelledRef.current += (speed * rate * TICK_MS) / 1000;
      const travelled = Math.min(travelledRef.current, total);

      let remaining = travelled;
      let legIndex = 0;
      // Only the coordinates matter from here on, not which stop it was.
      let point: { lat: number; lng: number } = stops[0];
      for (let i = 0; i < legs.length; i++) {
        if (remaining <= legs[i].meters || i === legs.length - 1) {
          legIndex = i;
          point = interpolate(legs[i].from, legs[i].to, Math.min(1, remaining / legs[i].meters));
          break;
        }
        remaining -= legs[i].meters;
      }

      setFix({
        lat: point.lat,
        lng: point.lng,
        // A believable urban fix, not a suspiciously perfect one.
        accuracy: 6 + Math.abs(Math.sin(travelled / 40)) * 9,
        at: Date.now(),
        legIndex,
        progress: total > 0 ? travelled / total : 1,
        done: travelled >= total,
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [active, stops, speed, rate]);

  return active ? fix : null;
}
