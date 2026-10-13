/**
 * The brake on paid calls: nobody gets to spend the model and voice credits
 * faster than a real walker would.
 *
 * Two layers, checked right before a call that costs money (never on a cache
 * hit, which is free):
 *
 *  - Per person, per kind of call, by the hour and by the day. Generous
 *    enough for a real walk — one itinerary, a dozen stops written, four or
 *    five recordings a stop — and a couple more walks after it. A script
 *    hammering the API runs into it within minutes. A person is their account
 *    when signed in, else this browser (lib/person.ts) — not their IP
 *    address, which a whole hotel or tour group can share.
 *  - Per IP address, the same limits five times over: the backstop for
 *    someone who throws the browser cookie away to be a new person on every
 *    call. Loose enough for a group on one Wi-Fi.
 *  - Everyone together, by the day: AI_DAILY_CAP_CALLS paid calls, then
 *    nothing until midnight UTC. This is the real circuit-breaker for the
 *    bill — it holds even against someone rotating addresses. A visitor
 *    already over their own limit is turned away before this counter is
 *    touched, so one abuser cannot use up the day for everyone else.
 *
 * People and addresses are stored only as salted SHA-256 hashes; neither the
 * account, the browser ID nor the address itself is kept. Counters live in Neon (rate_limits) and
 * expire with their window. Without a database — a local checkout — or when
 * it cannot be reached, the counts are kept in this server's memory instead:
 * weaker across servers, but the app keeps working and is still braked.
 *
 * Server-only.
 */

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { PERSON_HEADER, verifyPerson } from "@/lib/person";

export type Spend = "tour" | "script" | "audio" | "ask";

/** Per person: [per hour, per day]. */
const LIMITS: Record<Spend, [number, number]> = {
  // One itinerary per walk. Six an hour is someone trying cities, not a bot.
  tour: [6, 20],
  // Up to ~13 stops a walk, written once each.
  script: [40, 120],
  // Four or five recordings a stop, ~65 a full walk; replays are cached.
  audio: [150, 500],
  // A question every two minutes for an hour is a curious walker.
  ask: [30, 100],
};

/** How many people's worth of calls one IP address may make — a family, a small group. */
const PEOPLE_PER_ADDRESS = 5;

/** Every paid call from everyone, per UTC day. */
function dailyCap(): number {
  const n = Number(process.env.AI_DAILY_CAP_CALLS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3000;
}

const WORDS: Record<Spend, string> = {
  tour: "building tours",
  script: "writing stops",
  audio: "recording the guide's voice",
  ask: "answering questions",
};

/** Thrown (or returned as a 429) when a call would go over a limit. */
export class RateLimited extends Error {
  constructor(
    message: string,
    /** Seconds until the window that was hit resets. */
    readonly retryAfter: number,
  ) {
    super(message);
    this.name = "RateLimited";
  }
}

export function rateLimitedResponse(err: RateLimited): Response {
  return Response.json(
    { error: err.message },
    { status: 429, headers: { "retry-after": String(err.retryAfter) } },
  );
}

export function hashed(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? process.env.CLERK_SECRET_KEY ?? process.env.DATABASE_URL ?? "walkdots";
  return createHash("sha256").update(`${salt}|${value}`).digest("hex").slice(0, 32);
}

/** The caller's address, hashed. Vercel puts the real one first in x-forwarded-for. */
function address(headers: Headers): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
  return hashed(`ip|${ip}`);
}

/**
 * The person the proxy vouched for, hashed — or null when the request did not
 * come through it, in which case only the address limits apply.
 */
async function person(headers: Headers): Promise<string | null> {
  const id = await verifyPerson(headers.get(PERSON_HEADER));
  return id ? hashed(`person|${id}`) : null;
}

type Bucket = { key: string; limit: number; expires: Date };

function windows(now: Date) {
  const hourEnd = new Date(now);
  hourEnd.setUTCMinutes(60, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setUTCHours(24, 0, 0, 0);
  const hour = now.toISOString().slice(0, 13); // 2026-10-12T21
  const day = now.toISOString().slice(0, 10); // 2026-10-12
  return { hour, day, hourEnd, dayEnd };
}

// ---------------------------------------------------------------- storage

function sql() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

let ready: Promise<void> | null = null;
function ensureSchema(q: NonNullable<ReturnType<typeof sql>>): Promise<void> {
  ready ??= (async () => {
    await q`
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket text PRIMARY KEY,
        count integer NOT NULL,
        expires_at timestamptz NOT NULL
      )`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

const SWEEP_MS = 10 * 60_000;
let lastSweep = 0;

/** Fallback when there is no database to count in. Per server, bounded. */
const MEMORY = new Map<string, { count: number; expires: number }>();

function countInMemory(buckets: Bucket[]): number[] {
  const now = Date.now();
  if (MEMORY.size > 5000) for (const [k, v] of MEMORY) if (v.expires <= now) MEMORY.delete(k);
  return buckets.map((b) => {
    const cur = MEMORY.get(b.key);
    const next = cur && cur.expires > now ? cur.count + 1 : 1;
    MEMORY.set(b.key, { count: next, expires: b.expires.getTime() });
    return next;
  });
}

/** Adds one to each bucket, atomically in one statement, and returns the new counts. */
async function count(buckets: Bucket[]): Promise<number[]> {
  const q = sql();
  if (!q) return countInMemory(buckets);
  try {
    await ensureSchema(q);
    const keys = buckets.map((b) => b.key);
    const expires = buckets.map((b) => b.expires.toISOString());
    const rows = (await q`
      INSERT INTO rate_limits (bucket, count, expires_at)
      SELECT k, 1, e::timestamptz FROM unnest(${keys}::text[], ${expires}::text[]) AS t(k, e)
      ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
      RETURNING bucket, count`) as { bucket: string; count: number }[];
    // Sweep out windows that have closed, at most every ten minutes per
    // server, so a count outlives its hour or day by minutes, not weeks.
    if (Date.now() - lastSweep > SWEEP_MS) {
      lastSweep = Date.now();
      void q`DELETE FROM rate_limits WHERE expires_at < now()`.catch(() => {});
    }
    const by = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
    return buckets.map((b) => by.get(b.key) ?? 1);
  } catch (err) {
    // The database being unreachable must not take the walk down with it.
    console.error("[rate-limit] counting in memory:", err instanceof Error ? err.message : err);
    return countInMemory(buckets);
  }
}

// ------------------------------------------------------------------ check

/**
 * Records one paid call of this kind for whoever sent these headers, or throws
 * RateLimited if it would go over a limit. Call it immediately before the
 * call that costs money.
 */
export async function spend(headers: Headers, kind: Spend): Promise<void> {
  const now = new Date();
  const { hour, day, hourEnd, dayEnd } = windows(now);
  const who = await person(headers);
  const ip = address(headers);
  const [perHour, perDay] = LIMITS[kind];
  const secs = (d: Date) => Math.max(1, Math.ceil((d.getTime() - now.getTime()) / 1000));

  // The address backstop always; the person's own limits when there is one.
  // Without a person (a request that skipped the proxy) the address gets only
  // one person's allowance, not five.
  const share = who ? PEOPLE_PER_ADDRESS : 1;
  const [ipH, ipD, h = 0, d = 0] = await count([
    { key: `a:${ip}:${kind}:${hour}`, limit: perHour * share, expires: hourEnd },
    { key: `a:${ip}:${kind}:${day}`, limit: perDay * share, expires: dayEnd },
    ...(who
      ? [
          { key: `p:${who}:${kind}:${hour}`, limit: perHour, expires: hourEnd },
          { key: `p:${who}:${kind}:${day}`, limit: perDay, expires: dayEnd },
        ]
      : []),
  ]);
  if (ipD > perDay * share) {
    throw new RateLimited(
      `Too many requests for ${WORDS[kind]} from this network today. It resets at midnight UTC.`,
      secs(dayEnd),
    );
  }
  if (ipH > perHour * share) {
    const mins = Math.ceil(secs(hourEnd) / 60);
    throw new RateLimited(
      `Too many requests for ${WORDS[kind]} from this network — please try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      secs(hourEnd),
    );
  }
  if (d > perDay) {
    throw new RateLimited(
      `You've reached today's limit for ${WORDS[kind]}. It resets at midnight UTC.`,
      secs(dayEnd),
    );
  }
  if (h > perHour) {
    const mins = Math.ceil(secs(hourEnd) / 60);
    throw new RateLimited(
      `Too many requests for ${WORDS[kind]} — please try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      secs(hourEnd),
    );
  }

  const [all] = await count([{ key: `all:${day}`, limit: dailyCap(), expires: dayEnd }]);
  if (all > dailyCap()) {
    throw new RateLimited(
      "WalkDots has reached its daily limit for the AI guide. Please try again tomorrow.",
      secs(dayEnd),
    );
  }
}
