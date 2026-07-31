/**
 * Putting the rides into the walk.
 *
 * A tour is a list of points — the start, then each stop, then the finish —
 * and until now the line between them was one walking route through the lot.
 * Once some of those gaps are ridden rather than walked, the line has to say
 * so: drawing a footpath across a river the walker crosses by tram is the map
 * telling a lie in the one place a walker trusts it completely.
 *
 * So the points are cut into *runs* of consecutive walking, each routed on its
 * own, and the rides are drawn between them as a straight line from the stop
 * boarded at to the stop got off at. Straight because the shape of the tram's
 * own track is not worth the four Overpass queries it would cost to draw —
 * nobody navigates a tram, they sit on it.
 */

import type { Maneuver, TourRide, WalkingRoute } from "@/lib/providers/types";
import type { MapProvider } from "@/lib/providers/maps";
import { findRide } from "@/lib/providers/transit/osm";

export type LatLng = { lat: number; lng: number };

/**
 * How long the whole search for rides may take before the tour goes on
 * without them.
 *
 * Overpass is a shared public service and answers in anything from three
 * seconds to a minute. Generation has 120 seconds for everything and the
 * walker is watching a progress line the whole time, so the rides get a slice
 * of it and a tour with no ride in it is a smaller tour, not a failed one.
 */
const BUDGET_MS = 25_000;

/** Look for a ride in every gap at once, and take what has arrived in time. */
export async function findRides(points: LatLng[]): Promise<TourRide[]> {
  const gaps = points.slice(0, -1).map((from, i) => ({ from: i, to: i + 1, a: from, b: points[i + 1] }));

  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS));

  const found: (TourRide | null)[] = await Promise.all(
    gaps.map(async (g): Promise<TourRide | null> => {
      try {
        const ride = await Promise.race([findRide(g.a, g.b), deadline]);
        if (!ride) return null;
        return {
          from: g.from,
          to: g.to,
          mode: ride.mode,
          ref: ride.ref,
          headsign: ride.headsign,
          board: ride.board,
          alight: ride.alight,
          stops: ride.stops,
          minutes: ride.minutes,
        };
      } catch {
        return null;
      }
    }),
  );

  return found.filter((r): r is TourRide => r !== null);
}

type Line = { type: "Feature"; geometry: { type: "LineString"; coordinates: number[][] } };

function coordsOf(feature: unknown): number[][] {
  const geom = (feature as Line | null)?.geometry;
  return geom?.type === "LineString" ? geom.coordinates : [];
}

/**
 * One route for the whole tour, walked where it is walked and ridden where it
 * is ridden.
 *
 * The walking runs are routed separately and then stitched, which means their
 * maneuver indices — which point into each run's own line — have to be shifted
 * onto the joined one. Getting that wrong does not throw; it silently points
 * every direction at the wrong corner, which is why the offset is tracked
 * against the line as it is actually built rather than recomputed after.
 */
export async function routeWithRides(
  maps: MapProvider,
  points: LatLng[],
  rides: TourRide[],
): Promise<WalkingRoute> {
  const rideAt = new Map(rides.map((r) => [r.from, r]));

  /**
   * The walking runs, each carrying the ride that follows it.
   *
   * Paired here rather than looked up later: matching a ride back to a run by
   * comparing coordinates works right up until two stops share a boarding
   * point, and then it draws the wrong jump.
   */
  const runs: { points: LatLng[]; rideAfter?: TourRide }[] = [];
  let run: LatLng[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const ride = rideAt.get(i);
    if (ride) {
      // Walk to the stop it is boarded at, then stop walking.
      run.push({ lat: ride.board.lat, lng: ride.board.lng });
      runs.push({ points: run, rideAfter: ride });
      // The next run begins where the walker gets off.
      run = [{ lat: ride.alight.lat, lng: ride.alight.lng }, points[i + 1]];
    } else {
      run.push(points[i + 1]);
    }
  }
  runs.push({ points: run });

  const routed = await Promise.all(
    runs.map((r) => (r.points.length >= 2 ? maps.walkingRoute(r.points).catch(() => null) : null)),
  );

  const coordinates: number[][] = [];
  const maneuvers: Maneuver[] = [];
  let meters = 0;
  let seconds = 0;

  runs.forEach((r, i) => {
    const leg = routed[i];
    if (leg) {
      const legCoords = coordsOf(leg.geojson);
      const offset = coordinates.length;
      // Drop the joining point when one already ended where this begins.
      const start = coordinates.length > 0 && legCoords.length > 0 ? 1 : 0;
      coordinates.push(...legCoords.slice(start));
      for (const m of leg.maneuvers) {
        maneuvers.push({ ...m, beginShapeIndex: offset + Math.max(0, m.beginShapeIndex - start) });
      }
      meters += leg.meters;
      seconds += leg.seconds;
    } else if (r.points.length > 0) {
      // Routing failed for this run: a straight line keeps the tour drawable.
      for (const p of r.points) coordinates.push([p.lng, p.lat]);
    }

    // The ride that follows this run, drawn as the jump it is.
    if (r.rideAfter) {
      /**
       * The stop itself, before the jump away from it.
       *
       * The walking leg ends wherever the router snapped the boarding stop to
       * — a few metres off, since a tram platform is not a footpath — and the
       * blue overlay is drawn from the stop's own coordinates. Without this
       * the two start from slightly different places and the recolouring
       * misses by however far the snap happened to land. Measured at 3.5 m,
       * which is invisible and would stay invisible right up until the day it
       * was not.
       */
      coordinates.push([r.rideAfter.board.lng, r.rideAfter.board.lat]);
      coordinates.push([r.rideAfter.alight.lng, r.rideAfter.alight.lat]);
      // Counted in the tour's own clock, not as walking metres — see
      // lib/tour/timing.ts. Seconds are the estimate; metres stay a walk's.
      seconds += r.rideAfter.minutes * 60;
    }
  });

  return {
    geojson: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    } as unknown as WalkingRoute["geojson"],
    meters,
    seconds,
    maneuvers,
  };
}
