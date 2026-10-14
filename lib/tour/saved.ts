/**
 * Every tour, kept: the walk itself and the words written for its stops.
 *
 * Two tables in Neon, prefixed because walk-backend already owns `tours`:
 *
 *   saved_tours         one row per tour built — the plan, the route, the brief
 *   saved_stop_scripts  one row per stop narration written, keyed by everything
 *                       that decides its words (lib/tour/scriptCache's key)
 *
 * The scripts are keyed by content rather than by tour because that is what
 * the clients send when they ask for one (the brief, the stop, its place in
 * the walk) — so a saved tour finds its words again by asking the same
 * question, and the same stop in the same brief is never written twice. The
 * voice is kept the same way, in R2 (lib/storage/r2.ts).
 *
 * Off when DATABASE_URL is not set; every write is best-effort, because a
 * tour that was not saved is still a tour the walker can walk.
 */

import { neon } from "@neondatabase/serverless";
import type { StopScript } from "@/lib/providers/types";
import type { StoredTour } from "@/lib/tour/flow";

function sql() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

let ready: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const q = sql();
    if (!q) return;
    await q`
      CREATE TABLE IF NOT EXISTS saved_tours (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        tour jsonb NOT NULL
      )`;
    await q`CREATE INDEX IF NOT EXISTS saved_tours_created_at ON saved_tours (created_at DESC)`;
    await q`
      CREATE TABLE IF NOT EXISTS sample_tours (
        key text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        tour jsonb NOT NULL
      )`;
    await q`
      CREATE TABLE IF NOT EXISTS saved_stop_scripts (
        key text PRIMARY KEY,
        script text NOT NULL,
        walking_cue text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}

/** Keep a tour as it was built. Returns its id, or null when it could not be kept. */
/** As /api/tours finishes it — the same fields a StoredTour has, typed loosely
 *  because the route's maneuvers come straight from the map provider. */
export async function saveTour(tour: object): Promise<string | null> {
  const q = sql();
  if (!q) return null;
  try {
    await ensureSchema();
    const rows = (await q`INSERT INTO saved_tours (tour) VALUES (${JSON.stringify(tour)}::jsonb) RETURNING id`) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch (err) {
    console.warn("[saved] tour not kept", err);
    return null;
  }
}

/** A city's sample walk (lib/tour/sample.ts), by its key, or null. */
export async function loadSample(key: string): Promise<StoredTour | null> {
  const q = sql();
  if (!q) return null;
  await ensureSchema();
  const rows = (await q`SELECT tour FROM sample_tours WHERE key = ${key}`) as { tour: StoredTour }[];
  return rows[0]?.tour ?? null;
}

/** Keep a sample walk. The first one kept for a key wins; a racing second build is dropped. */
export async function saveSample(key: string, tour: StoredTour): Promise<void> {
  const q = sql();
  if (!q) return;
  try {
    await ensureSchema();
    await q`INSERT INTO sample_tours (key, tour) VALUES (${key}, ${JSON.stringify(tour)}::jsonb) ON CONFLICT (key) DO NOTHING`;
  } catch (err) {
    console.warn("[saved] sample not kept", err);
  }
}

/** The tour marked as the demo (`"demo": true` in its record), newest first. */
export async function pinnedDemo(): Promise<{ id: string; tour: StoredTour } | null> {
  const q = sql();
  if (!q) return null;
  await ensureSchema();
  const rows = (await q`
    SELECT id, tour FROM saved_tours WHERE tour->>'demo' = 'true' ORDER BY created_at DESC LIMIT 1`) as {
    id: string;
    tour: StoredTour;
  }[];
  return rows[0] ?? null;
}

/** One saved tour, summarised for the developers' list. */
export type SavedTourSummary = {
  id: string;
  createdAt: string;
  title: string;
  city: string | null;
  minutes: number | null;
  detail: string | null;
  pace: string | null;
  interests: string[];
  lang: string | null;
  stops: number;
  meters: number | null;
  freeText: string | null;
  demo: boolean;
};

/** The newest saved tours, without their routes and words. */
export async function listSavedTours(limit: number): Promise<SavedTourSummary[]> {
  const q = sql();
  if (!q) return [];
  await ensureSchema();
  const rows = (await q`
    SELECT id, created_at,
      tour->'plan'->>'title' AS title,
      tour->'req'->'city'->>'name' AS city,
      (tour->'req'->>'durationMinutes')::int AS minutes,
      tour->'req'->>'detail' AS detail,
      tour->'req'->>'pace' AS pace,
      COALESCE(tour->'req'->'interests', '[]'::jsonb) AS interests,
      tour->'req'->>'lang' AS lang,
      jsonb_array_length(tour->'plan'->'stops') AS stops,
      (tour->>'meters')::float AS meters,
      tour->'req'->>'freeText' AS free_text,
      COALESCE(tour->>'demo' = 'true', false) AS demo
    FROM saved_tours ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: new Date(r.created_at as string).toISOString(),
    title: (r.title as string) ?? "Untitled",
    city: (r.city as string) ?? null,
    minutes: (r.minutes as number) ?? null,
    detail: (r.detail as string) ?? null,
    pace: (r.pace as string) ?? null,
    interests: (r.interests as string[]) ?? [],
    lang: (r.lang as string) ?? null,
    stops: Number(r.stops ?? 0),
    meters: (r.meters as number) ?? null,
    freeText: (r.free_text as string) ?? null,
    demo: Boolean(r.demo),
  }));
}

export async function loadScript(key: string): Promise<StopScript | null> {
  const q = sql();
  if (!q) return null;
  try {
    await ensureSchema();
    const rows = (await q`SELECT script, walking_cue FROM saved_stop_scripts WHERE key = ${key}`) as {
      script: string;
      walking_cue: string;
    }[];
    return rows[0] ? { script: rows[0].script, walkingCueToHere: rows[0].walking_cue } : null;
  } catch (err) {
    console.warn("[saved] script lookup failed", err);
    return null;
  }
}

/** Many at once, for putting a saved tour's words back. */
export async function loadScripts(keys: string[]): Promise<Map<string, StopScript>> {
  const q = sql();
  const found = new Map<string, StopScript>();
  if (!q || keys.length === 0) return found;
  await ensureSchema();
  const rows = (await q`SELECT key, script, walking_cue FROM saved_stop_scripts WHERE key = ANY(${keys})`) as {
    key: string;
    script: string;
    walking_cue: string;
  }[];
  for (const r of rows) found.set(r.key, { script: r.script, walkingCueToHere: r.walking_cue });
  return found;
}

export async function saveScript(key: string, s: StopScript): Promise<void> {
  const q = sql();
  if (!q) return;
  try {
    await ensureSchema();
    await q`
      INSERT INTO saved_stop_scripts (key, script, walking_cue)
      VALUES (${key}, ${s.script}, ${s.walkingCueToHere ?? ""})
      ON CONFLICT (key) DO NOTHING`;
  } catch (err) {
    console.warn("[saved] script not kept", err);
  }
}
