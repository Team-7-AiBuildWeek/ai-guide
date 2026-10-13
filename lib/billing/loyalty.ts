/**
 * Points for walking.
 *
 *  - Earn: 50 points for each paid walk completed (most of its stops reached
 *    on foot), 100 more for the first completed walk in a new city, and 500
 *    each when someone you invited makes their first purchase.
 *  - Spend: 500 points is one walk (a bonus credit, lib/billing/store.ts).
 *  - Points never become money. They expire after 12 months without activity.
 *  - The free walk, walks paid for with points, and promotions earn nothing.
 *  - Tiers by paid walks completed: Explorer (0), Wanderer (5), Local Legend (15).
 *
 * Each award is an event with a unique (user, kind, ref), so the same walk,
 * city or referral can only ever pay once, whatever the client sends.
 *
 * Switched on by LOYALTY_ENABLED=1. Server-only.
 */

import { ensureSchema as ensureBilling, sql } from "./store";

export const POINTS_PER_WALK = 50;
export const POINTS_NEW_CITY = 100;
export const POINTS_REFERRAL = 500;
export const POINTS_PER_REWARD = 500;
/** Walks awarded per day at most: a guard against replayed completions. */
const AWARDS_PER_DAY = 3;

export const TIERS = [
  { name: "Explorer", from: 0 },
  { name: "Wanderer", from: 5 },
  { name: "Local Legend", from: 15 },
] as const;

export function loyaltyEnabled(): boolean {
  return process.env.LOYALTY_ENABLED === "1";
}

let ready: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureBilling();
    const q = sql();
    await q`
      CREATE TABLE IF NOT EXISTS loyalty_accounts (
        user_id text PRIMARY KEY,
        balance int NOT NULL DEFAULT 0,
        lifetime int NOT NULL DEFAULT 0,
        walks_completed int NOT NULL DEFAULT 0,
        cities text[] NOT NULL DEFAULT '{}',
        referral_code text UNIQUE NOT NULL,
        last_activity_at timestamptz NOT NULL DEFAULT now()
      )`;
    await q`
      CREATE TABLE IF NOT EXISTS loyalty_events (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('walk', 'city', 'referral', 'redeem', 'expire', 'clawback', 'adjust')),
        ref text NOT NULL,
        points int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, kind, ref)
      )`;
    await q`
      CREATE TABLE IF NOT EXISTS referrals (
        referee_id text PRIMARY KEY,
        referrer_id text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'void')),
        purchase_id bigint,
        created_at timestamptz NOT NULL DEFAULT now(),
        rewarded_at timestamptz,
        CHECK (referee_id <> referrer_id)
      )`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** A short code to share: no 0/O or 1/I to misread. */
function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** The account's loyalty row, made on first use. */
async function account(userId: string): Promise<void> {
  await ensureSchema();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sql()`
        INSERT INTO loyalty_accounts (user_id, referral_code) VALUES (${userId}, ${newCode()})
        ON CONFLICT (user_id) DO NOTHING`;
      return;
    } catch (err) {
      // A code collision (1 in 34^7): try another.
      if (attempt === 2) throw err;
    }
  }
}

/** Points left untouched for a year are gone. Called on every read. */
async function expire(userId: string): Promise<void> {
  await sql()`
    WITH a AS (
      SELECT user_id, balance, last_activity_at FROM loyalty_accounts
      WHERE user_id = ${userId} AND balance > 0 AND last_activity_at < now() - interval '12 months'),
    ev AS (
      INSERT INTO loyalty_events (user_id, kind, ref, points)
      SELECT user_id, 'expire', last_activity_at::text, -balance FROM a
      ON CONFLICT DO NOTHING RETURNING user_id)
    UPDATE loyalty_accounts SET balance = 0 FROM ev WHERE loyalty_accounts.user_id = ev.user_id`;
}

export type Loyalty = {
  balance: number;
  lifetime: number;
  walksCompleted: number;
  tier: string;
  nextTier: { name: string; walksToGo: number } | null;
  cities: string[];
  referralCode: string;
  pointsPerReward: number;
};

export async function loyaltyFor(userId: string): Promise<Loyalty> {
  await account(userId);
  await expire(userId);
  const [a] = (await sql()`
    SELECT balance, lifetime, walks_completed, cities, referral_code FROM loyalty_accounts WHERE user_id = ${userId}`) as {
    balance: number;
    lifetime: number;
    walks_completed: number;
    cities: string[];
    referral_code: string;
  }[];
  const tier = [...TIERS].reverse().find((t) => a.walks_completed >= t.from) ?? TIERS[0];
  const next = TIERS.find((t) => t.from > a.walks_completed);
  return {
    balance: a.balance,
    lifetime: a.lifetime,
    walksCompleted: a.walks_completed,
    tier: tier.name,
    nextTier: next ? { name: next.name, walksToGo: next.from - a.walks_completed } : null,
    cities: a.cities,
    referralCode: a.referral_code,
    pointsPerReward: POINTS_PER_REWARD,
  };
}

// ------------------------------------------------------------- completion

export type Visit = { i: number; t: number; lat: number; lng: number; acc: number };

function metres(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * A walk completed: checked against what the server kept when it was built
 * (walk_ledger), then awarded once. Light on purpose — the most a cheat gains
 * is a 10% rebate on walks they paid for — but enough that points come from
 * walking: real arrivals near the real stops, in order, at a walking pace.
 * The positions are checked and dropped; only "completed" is kept.
 */
export async function completeWalk(
  userId: string,
  walkId: string,
  visits: Visit[],
): Promise<{ awarded: number; newCity: boolean; reason?: string }> {
  await account(userId);
  const [w] = (await sql()`
    SELECT source, status, stops, has_rides, city_key, city_label, completed_at,
           extract(epoch FROM delivered_at) * 1000 AS delivered_ms
    FROM walk_ledger WHERE walk_id = ${walkId} AND user_id = ${userId}`) as {
    source: string;
    status: string;
    stops: [number, number][] | null;
    has_rides: boolean;
    city_key: string | null;
    city_label: string | null;
    completed_at: string | null;
    delivered_ms: number | null;
  }[];
  const no = (reason: string) => ({ awarded: 0, newCity: false, reason });
  if (!w || !w.stops?.length || !w.delivered_ms) return no("unknown walk");
  if (w.status !== "delivered") return no("not a delivered walk");
  if (!["pass", "annual", "credit"].includes(w.source)) return no("only paid walks earn points");
  if (w.completed_at) return no("already completed");
  if (Date.now() - w.delivered_ms > 7 * 24 * 3600_000) return no("too old");

  // Real arrivals: each near its stop, with an honest fix, in time order,
  // after the walk was built and not in the future.
  const n = w.stops.length;
  const good = new Map<number, Visit>();
  let lastT = 0;
  for (const v of [...visits].sort((a, b) => a.t - b.t)) {
    const stop = w.stops[v.i];
    if (!stop || v.acc > 100 || v.t < w.delivered_ms || v.t > Date.now() + 120_000 || v.t < lastT) continue;
    if (metres(stop, [v.lat, v.lng]) > 75) continue;
    if (!good.has(v.i)) good.set(v.i, v);
    lastT = v.t;
  }
  const reachedLast = good.has(n - 1);
  if (good.size < Math.ceil(0.8 * n) && !(reachedLast && good.size >= Math.ceil(0.5 * n))) return no("not enough stops reached");

  // A walking pace, at most: no teleporting between stops.
  const ordered = [...good.values()].sort((a, b) => a.t - b.t);
  const maxSpeed = w.has_rides ? 8 : 2.5; // m/s; a tram is allowed where the route rides
  let distance = 0;
  for (let k = 1; k < ordered.length; k++) distance += metres([ordered[k - 1].lat, ordered[k - 1].lng], [ordered[k].lat, ordered[k].lng]);
  const elapsed = (ordered[ordered.length - 1].t - ordered[0].t) / 1000;
  if (ordered.length > 1 && (elapsed < distance / maxSpeed || elapsed < 120 * (ordered.length - 1))) return no("too fast");

  const [{ today }] = (await sql()`
    SELECT count(*)::int AS today FROM loyalty_events
    WHERE user_id = ${userId} AND kind = 'walk' AND created_at > now() - interval '24 hours'`) as { today: number }[];
  if (today >= AWARDS_PER_DAY) return no("daily limit");

  const q = sql();
  const [walk, city] = (await q.transaction([
    q`WITH ev AS (
        INSERT INTO loyalty_events (user_id, kind, ref, points) VALUES (${userId}, 'walk', ${walkId}, ${POINTS_PER_WALK})
        ON CONFLICT DO NOTHING RETURNING points)
      UPDATE loyalty_accounts SET balance = balance + ev.points, lifetime = lifetime + ev.points,
        walks_completed = walks_completed + 1, last_activity_at = now()
      FROM ev WHERE user_id = ${userId}
      RETURNING ev.points`,
    q`WITH ev AS (
        INSERT INTO loyalty_events (user_id, kind, ref, points)
        SELECT ${userId}, 'city', ${w.city_key}, ${POINTS_NEW_CITY}
        WHERE ${w.city_key}::text IS NOT NULL
          AND EXISTS (SELECT 1 FROM loyalty_events WHERE user_id = ${userId} AND kind = 'walk' AND ref = ${walkId})
        ON CONFLICT DO NOTHING RETURNING points)
      UPDATE loyalty_accounts SET balance = balance + ev.points, lifetime = lifetime + ev.points,
        cities = CASE WHEN ${w.city_label}::text IS NULL THEN cities ELSE array_append(cities, ${w.city_label}) END
      FROM ev WHERE user_id = ${userId}
      RETURNING ev.points`,
    q`UPDATE walk_ledger SET completed_at = now() WHERE walk_id = ${walkId}`,
  ])) as [{ points: number }[], { points: number }[], unknown];
  const awarded = (walk[0]?.points ?? 0) + (city[0]?.points ?? 0);
  return { awarded, newCity: !!city[0] };
}

// ---------------------------------------------------------------- redeem

/** 500 points → one walk. Safe to retry with the same key; never goes below zero. */
export async function redeem(userId: string, key: string): Promise<{ ok: boolean; bonusCredits?: number }> {
  await account(userId);
  const q = sql();
  const [, rows] = (await q.transaction([
    q`SELECT 1 FROM loyalty_accounts WHERE user_id = ${userId} FOR UPDATE`,
    q`WITH a AS (SELECT user_id FROM loyalty_accounts WHERE user_id = ${userId} AND balance >= ${POINTS_PER_REWARD}),
      ev AS (
        INSERT INTO loyalty_events (user_id, kind, ref, points)
        SELECT user_id, 'redeem', ${key}, ${-POINTS_PER_REWARD} FROM a
        ON CONFLICT DO NOTHING RETURNING user_id),
      b AS (
        UPDATE loyalty_accounts l SET balance = balance - ${POINTS_PER_REWARD}, last_activity_at = now()
        FROM ev WHERE l.user_id = ev.user_id RETURNING l.user_id)
      INSERT INTO entitlements (user_id, bonus_credits) SELECT user_id, 1 FROM b
      ON CONFLICT (user_id) DO UPDATE SET bonus_credits = entitlements.bonus_credits + 1, updated_at = now()
      RETURNING bonus_credits`,
  ])) as [unknown, { bonus_credits: number }[]];
  return rows[0] ? { ok: true, bonusCredits: rows[0].bonus_credits } : { ok: false };
}

// -------------------------------------------------------------- referrals

/**
 * Records who invited a new account. Only for accounts made in the last week
 * that have bought nothing, one inviter per person ever, never yourself, and
 * at most twenty rewarded invitations a year per inviter.
 */
export async function claimReferral(refereeId: string, code: string, accountCreatedMs: number): Promise<boolean> {
  await ensureSchema();
  if (Date.now() - accountCreatedMs > 7 * 24 * 3600_000) return false;
  const rows = (await sql()`
    INSERT INTO referrals (referee_id, referrer_id)
    SELECT ${refereeId}, l.user_id FROM loyalty_accounts l
    WHERE l.referral_code = ${code.trim().toUpperCase()} AND l.user_id <> ${refereeId}
      AND NOT EXISTS (SELECT 1 FROM purchases WHERE user_id = ${refereeId})
      AND NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id = l.user_id AND flagged IS NOT NULL)
      AND (SELECT count(*) FROM referrals WHERE referrer_id = l.user_id AND status = 'rewarded'
           AND rewarded_at > now() - interval '1 year') < 20
    ON CONFLICT (referee_id) DO NOTHING
    RETURNING referrer_id`) as { referrer_id: string }[];
  return rows.length > 0;
}

/** A first real purchase by someone who was invited: 500 points each. Idempotent. */
export async function rewardReferral(refereeId: string): Promise<void> {
  await ensureSchema();
  const rows = (await sql()`
    UPDATE referrals SET status = 'rewarded', rewarded_at = now()
    WHERE referee_id = ${refereeId} AND status = 'pending'
    RETURNING referrer_id`) as { referrer_id: string }[];
  const r = rows[0];
  if (!r) return;
  for (const user of [r.referrer_id, refereeId]) {
    await account(user);
    await sql()`
      WITH ev AS (
        INSERT INTO loyalty_events (user_id, kind, ref, points) VALUES (${user}, 'referral', ${refereeId}, ${POINTS_REFERRAL})
        ON CONFLICT DO NOTHING RETURNING points)
      UPDATE loyalty_accounts SET balance = balance + ev.points, lifetime = lifetime + ev.points, last_activity_at = now()
      FROM ev WHERE user_id = ${user}`;
  }
}

/** A refunded qualifying purchase takes the referral points back (a balance may go below zero). */
export async function clawBackReferral(refereeId: string): Promise<void> {
  await ensureSchema();
  const rows = (await sql()`
    UPDATE referrals SET status = 'void' WHERE referee_id = ${refereeId} AND status = 'rewarded'
    RETURNING referrer_id`) as { referrer_id: string }[];
  const r = rows[0];
  if (!r) return;
  for (const user of [r.referrer_id, refereeId]) {
    await sql()`
      WITH ev AS (
        INSERT INTO loyalty_events (user_id, kind, ref, points) VALUES (${user}, 'clawback', ${refereeId}, ${-POINTS_REFERRAL})
        ON CONFLICT DO NOTHING RETURNING points)
      UPDATE loyalty_accounts SET balance = balance + ev.points FROM ev WHERE user_id = ${user}`;
  }
}

/** Deleting an account takes its points with it; invitations it made stay counted, without it. */
export async function forgetLoyalty(userId: string): Promise<void> {
  await ensureSchema();
  const q = sql();
  await q`DELETE FROM loyalty_events WHERE user_id = ${userId}`;
  await q`DELETE FROM loyalty_accounts WHERE user_id = ${userId}`;
  await q`DELETE FROM referrals WHERE referee_id = ${userId}`;
  await q`UPDATE referrals SET referrer_id = 'deleted' WHERE referrer_id = ${userId}`;
}
