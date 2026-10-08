/**
 * The demo tour: one somebody already made, played back from storage.
 *
 * Every tour is kept when it is built (lib/tour/saved.ts), every stop's words
 * when they are written, and every piece of the guide's voice when it is
 * spoken (R2, see /api/audio). This finds the newest kept tour that is whole —
 * every stop written, and every piece of every stop already voiced — and
 * hands it back with its words in place, so it opens instantly and playing it
 * spends nothing: the words skip the model, and each piece of voice the app
 * asks /api/audio for is answered from storage.
 *
 * When no tour is fully voiced yet it falls back to the newest fully written
 * one, says so in `x-demo-voice: partial`, and the missing pieces are voiced
 * (and kept) the first time the demo plays them.
 */

import { chunkScript } from "@/lib/audio/chunk";
import { normaliseLang } from "@/lib/i18n/languages";
import { r2Enabled, r2Has } from "@/lib/storage/r2";
import { recentTours, loadScripts } from "@/lib/tour/saved";
import { scriptKey } from "@/lib/tour/scriptCache";
import { voiceKey, voiceObject } from "@/lib/tour/voiceKey";
import type { StoredTour } from "@/lib/tour/flow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How far back to look. A demo needs one good tour, not the archive. */
const LOOK_BACK = 25;

/** The tour with its words put back, or null when any stop was never written. */
async function withWords(tour: StoredTour): Promise<StoredTour | null> {
  const req = tour.req;
  if (!req) return null;
  req.lang = normaliseLang(req.lang);
  const stops = tour.plan.stops;
  const keys = stops.map((stop, i) =>
    scriptKey({ req, stop, previous: i > 0 ? stops[i - 1] : null, position: i + 1, total: stops.length }),
  );
  const scripts = await loadScripts(keys);
  const filled = stops.map((stop, i) => {
    const kept = scripts.get(keys[i]);
    const script = stop.script ?? kept?.script;
    return script ? { ...stop, script, walkingCueToHere: kept?.walkingCueToHere || stop.walkingCueToHere } : null;
  });
  if (filled.some((s) => s === null)) return null;
  return { ...tour, req, plan: { ...tour.plan, stops: filled as StoredTour["plan"]["stops"] } };
}

/** Whether every piece the app will ask to hear is already in storage. */
async function fullyVoiced(tour: StoredTour): Promise<boolean> {
  const lang = tour.req?.lang ?? "en";
  const pieces = tour.plan.stops.flatMap((s) => chunkScript(s.script ?? ""));
  const found = await Promise.all(pieces.map((text) => r2Has(voiceObject(voiceKey(text, lang)))));
  return found.every(Boolean);
}

/**
 * Somebody else's walk, shown to anyone: without the words they typed or the
 * name of where they started (see the privacy policy). Every stop already
 * has its words, so the brief is not needed to write any.
 */
function shareable(tour: StoredTour): StoredTour {
  if (!tour.req) return tour;
  const { freeText, start, ...req } = tour.req;
  void freeText;
  return { ...tour, req: { ...req, start: { lat: start.lat, lng: start.lng } } };
}

export async function GET() {
  let rows: { id: string; tour: StoredTour }[];
  try {
    rows = await recentTours(LOOK_BACK);
  } catch (err) {
    console.error("[demo-tour] saved tours unreachable", err);
    return Response.json({ error: "The saved tours could not be reached." }, { status: 503 });
  }

  let fallback: StoredTour | null = null;
  for (const row of rows) {
    const whole = await withWords(row.tour);
    if (!whole) continue;
    if (r2Enabled() && (await fullyVoiced(whole))) {
      return Response.json(
        { ...shareable(whole), demo: true },
        { headers: { "x-demo-tour": row.id, "x-demo-voice": "stored" } },
      );
    }
    fallback ??= whole;
  }
  if (fallback) {
    return Response.json({ ...shareable(fallback), demo: true }, { headers: { "x-demo-voice": "partial" } });
  }
  return Response.json(
    { error: "No finished tour is saved yet. Walk one all the way through, and it becomes the demo." },
    { status: 404 },
  );
}
