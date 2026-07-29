/**
 * Putting the stops in walking order.
 *
 * The model is asked for a sensible order and mostly gives one, but "mostly"
 * shows up on the map as a walk that crosses the same square twice: a Vienna
 * tour went Heldenplatz, back east to the Stallburg, then south again, which
 * is three hundred metres of pointless backtracking on a route the walker can
 * see is wrong.
 *
 * Ordering happens after snapping, on the real coordinates rather than the
 * model's guesses, and before the narration is written — the walking cues
 * describe "from the previous stop", so they have to be written against the
 * final order, not fixed up afterwards.
 *
 * Straight-line distance, not street distance. Routing every candidate order
 * would be hundreds of API calls to improve on an answer that is already right
 * nearly every time.
 */

import { haversine } from "@/lib/providers/maps";
import type { LatLng, Stop } from "@/lib/providers/types";

type Point = LatLng;

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

/**
 * Nearest neighbour from the start, then 2-opt until no swap helps.
 *
 * 2-opt reverses a run of the path, which is exactly the fix for a route that
 * crosses itself. With at most a few dozen stops this converges in a blink.
 *
 * `end`, when given, is where the walk has to finish, so it is held in place
 * and never reordered.
 */
export function orderStops(stops: Stop[], start: LatLng, end?: LatLng | null): Stop[] {
  if (stops.length < 3) return stops;

  // ---- nearest neighbour ----
  const remaining = [...stops];
  const ordered: Stop[] = [];
  let at: Point = start;
  while (remaining.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(at, remaining[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const [next] = remaining.splice(best, 1);
    ordered.push(next);
    at = next;
  }

  // ---- 2-opt ----
  // The fixed endpoints bracket the tour so reversals are measured against the
  // walk the walker actually does, including getting to the first stop and away
  // from the last.
  const cost = (seq: Stop[]) => pathLength([start, ...seq, ...(end ? [end] : [start])]);

  let bestSeq = ordered;
  let bestCost = cost(bestSeq);
  let improved = true;
  // A ceiling on passes: this always converges quickly, and a walker waiting
  // on a street corner is not the place to find out otherwise.
  for (let pass = 0; improved && pass < 40; pass++) {
    improved = false;
    for (let i = 0; i < bestSeq.length - 1; i++) {
      for (let k = i + 1; k < bestSeq.length; k++) {
        const candidate = [
          ...bestSeq.slice(0, i),
          ...bestSeq.slice(i, k + 1).reverse(),
          ...bestSeq.slice(k + 1),
        ];
        const c = cost(candidate);
        // A metre of improvement is noise, not a better walk.
        if (c < bestCost - 1) {
          bestSeq = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }

  return bestSeq;
}

/** What the reordering saved, for the log line. */
export function walkLength(stops: Stop[], start: LatLng, end?: LatLng | null): number {
  return pathLength([start, ...stops, ...(end ? [end] : [start])]);
}
