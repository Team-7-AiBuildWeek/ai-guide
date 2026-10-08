/**
 * The demo tour: a finished walk kept in the database, opened instantly.
 *
 * It is whichever saved tour is marked `"demo": true` (lib/tour/saved.ts).
 * The first time it is asked for and none is marked, the Tokyo walk in
 * lib/tour/demo-tokyo.json is saved as the demo — six Asakusa stops with
 * their words written and their route planned, so opening it spends no
 * model call. To make another kept tour the demo, set `"demo": true` in its
 * record; the newest marked one wins.
 *
 * The voice is made by /api/audio as it plays, and kept in R2 once that is
 * configured, so each piece is paid for once and the demo is free after.
 *
 * A kept tour may be somebody else's walk, so it goes out without the words
 * they typed or the name of where they started (see the privacy policy).
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { loadScripts, pinnedDemo, saveTour } from "@/lib/tour/saved";
import { scriptKey } from "@/lib/tour/scriptCache";
import type { StoredTour } from "@/lib/tour/flow";
import tokyo from "@/lib/tour/demo-tokyo.json";

export const dynamic = "force-dynamic";

/** The tour with every stop's words in place, or null when any was never written. */
async function withWords(tour: StoredTour): Promise<StoredTour | null> {
  const req = tour.req;
  if (!req) return null;
  req.lang = normaliseLang(req.lang);
  const stops = tour.plan.stops;
  const keys = stops.map((stop, i) =>
    scriptKey({ req, stop, previous: i > 0 ? stops[i - 1] : null, position: i + 1, total: stops.length }),
  );
  const scripts = stops.every((s) => s.script) ? new Map() : await loadScripts(keys);
  const filled = stops.map((stop, i) => {
    const kept = scripts.get(keys[i]);
    const script = stop.script ?? kept?.script;
    return script ? { ...stop, script, walkingCueToHere: kept?.walkingCueToHere || stop.walkingCueToHere } : null;
  });
  if (filled.some((s) => s === null)) return null;
  return { ...tour, req, plan: { ...tour.plan, stops: filled as StoredTour["plan"]["stops"] } };
}

function shareable(tour: StoredTour): StoredTour {
  if (!tour.req) return tour;
  const { freeText, start, ...req } = tour.req;
  void freeText;
  return { ...tour, req: { ...req, start: { lat: start.lat, lng: start.lng } } };
}

export async function GET() {
  try {
    let pinned = await pinnedDemo();
    if (!pinned) {
      const seed = { ...(tokyo as unknown as StoredTour), demo: true };
      const id = await saveTour(seed);
      pinned = { id: id ?? "unsaved", tour: seed };
    }
    const whole = await withWords(pinned.tour);
    if (!whole) {
      return Response.json({ error: "The demo tour is missing some of its stops' words." }, { status: 500 });
    }
    return Response.json({ ...shareable(whole), demo: true }, { headers: { "x-demo-tour": pinned.id } });
  } catch (err) {
    console.error("[demo-tour] saved tours unreachable", err);
    return Response.json({ error: "The saved tours could not be reached." }, { status: 503 });
  }
}
