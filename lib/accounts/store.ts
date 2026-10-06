/**
 * Walks kept for signed-in walkers, so the website and the phone share them.
 *
 * One row per walk, keyed by the Clerk user and the moment the walk was built
 * (the same `at` both devices already use), holding the walk record exactly as
 * the device keeps it. Nothing else about the walker is stored here: their
 * email lives with Clerk.
 *
 * The table belongs to the website, so the website creates it — once per
 * server instance, on first use, idempotently.
 */

import { neon } from "@neondatabase/serverless";

export type StoredWalk = { at: number } & Record<string, unknown>;

/** Matches the devices: they keep the latest 30 walks. */
const KEEP = 30;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return neon(url);
}

let ready: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const q = sql();
    await q`
      CREATE TABLE IF NOT EXISTS user_walks (
        user_id text NOT NULL,
        at bigint NOT NULL,
        record jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, at)
      )`;
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}

export async function listWalks(userId: string): Promise<StoredWalk[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT record FROM user_walks WHERE user_id = ${userId} ORDER BY at DESC LIMIT ${KEEP}`) as { record: StoredWalk }[];
  return rows.map((r) => r.record);
}

/** Adds walks this account has not seen; a walk already kept is left as it is. */
export async function addWalks(userId: string, walks: StoredWalk[]): Promise<StoredWalk[]> {
  await ensureSchema();
  const q = sql();
  for (const w of walks.slice(0, KEEP)) {
    if (!Number.isFinite(w?.at)) continue;
    await q`
      INSERT INTO user_walks (user_id, at, record) VALUES (${userId}, ${Math.trunc(w.at)}, ${JSON.stringify(w)}::jsonb)
      ON CONFLICT (user_id, at) DO NOTHING`;
  }
  // Older than the newest thirty: gone, the same as on the devices.
  await q`
    DELETE FROM user_walks WHERE user_id = ${userId} AND at NOT IN (
      SELECT at FROM user_walks WHERE user_id = ${userId} ORDER BY at DESC LIMIT ${KEEP})`;
  return listWalks(userId);
}

export async function forgetWalk(userId: string, at: number): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM user_walks WHERE user_id = ${userId} AND at = ${Math.trunc(at)}`;
}

/** Everything kept for an account, before the account itself is deleted. */
export async function forgetUser(userId: string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM user_walks WHERE user_id = ${userId}`;
}

export function accountsConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY && !!process.env.DATABASE_URL;
}
