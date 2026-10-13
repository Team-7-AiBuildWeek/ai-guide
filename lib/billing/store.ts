/**
 * Who may build a walk, and what each walk came out of.
 *
 * A walk is one fresh itinerary — the moment the model is asked for stops.
 * Walking a tour again, the demo and walks the backend has already recorded
 * never count. Each person gets one free walk; after that a walk comes out of
 * an active pass (fair use: three a day), an annual plan (ten a month), a
 * bought walk credit, or a bonus credit (points, promotions), in that order.
 *
 * Every walk is booked as `reserved` before the paid work starts, then marked
 * `delivered` when the walker has it — or `refunded` when the build fails, so
 * a model error or a dropped connection never costs anyone a walk.
 *
 * The free walk is tied to every identity a person shows: the browser (always)
 * and the account (when signed in). Taking it signed out and then signing in,
 * or the other way round, finds it used. Clearing cookies gives a new browser,
 * which is why there is also a per-address backstop: past three free walks from
 * one address in a day, the next one asks for an account (not for money).
 *
 * Identities are stored hashed, like the rate limits (lib/rateLimit.ts).
 * Tables are created on first use, idempotently, like lib/accounts/store.ts.
 *
 * Server-only.
 */

import { neon } from "@neondatabase/serverless";
import { DEVICE_HEADER, PERSON_HEADER, verifyPerson } from "@/lib/person";
import { hashed } from "@/lib/rateLimit";
import type { TourPlan, TourRequest, TourRide } from "@/lib/providers/types";

/** Fair use on a pass: walks per UTC day. */
export const PASS_WALKS_PER_DAY = 3;
/** Fair use on the annual plan: walks per UTC month. */
export const ANNUAL_WALKS_PER_MONTH = 10;
/** Free walks from one address in 24 h before the next one needs an account. */
const FREE_PER_ADDRESS_PER_DAY = 3;

export type WalkSource = "free" | "pass" | "annual" | "credit" | "bonus" | "dev";

/** Why a walk was refused, for the paywall to say the right thing. */
export type PaywallReason =
  | "signin_for_free" //   too many free walks from this address: sign in to get yours
  | "signin" //            free walk used; buying needs an account
  | "no_walks" //          signed in, nothing left
  | "fair_use_pass" //     pass active, today's three used
  | "fair_use_annual"; //  plan active, this month's ten used

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return neon(url);
}

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const q = sql();
    await q`
      CREATE TABLE IF NOT EXISTS free_walks (
        subject text PRIMARY KEY,
        kind char(1) NOT NULL,
        walk_id uuid,
        ip_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await q`CREATE INDEX IF NOT EXISTS free_walks_ip ON free_walks (ip_hash, created_at) WHERE kind = 'd'`;
    await q`
      CREATE TABLE IF NOT EXISTS entitlements (
        user_id text PRIMARY KEY,
        credits int NOT NULL DEFAULT 0 CHECK (credits >= 0),
        bonus_credits int NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
        pass_kind text CHECK (pass_kind IN ('city72h', 'trip7d')),
        pass_until timestamptz,
        pass_day date,
        pass_day_used int NOT NULL DEFAULT 0,
        sub_id text UNIQUE,
        sub_status text,
        sub_until timestamptz,
        sub_cancel_at_period_end boolean NOT NULL DEFAULT false,
        sub_month text,
        sub_month_used int NOT NULL DEFAULT 0,
        stripe_customer text UNIQUE,
        flagged text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await q`
      CREATE TABLE IF NOT EXISTS walk_ledger (
        walk_id uuid PRIMARY KEY,
        user_id text,
        person_hash text NOT NULL,
        source text NOT NULL CHECK (source IN ('free', 'pass', 'annual', 'credit', 'bonus', 'dev', 'none')),
        status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'delivered', 'refunded', 'shadow')),
        stop_count int,
        stops jsonb,
        plan_meters int,
        has_rides boolean,
        city_key text,
        city_label text,
        created_at timestamptz NOT NULL DEFAULT now(),
        delivered_at timestamptz,
        completed_at timestamptz
      )`;
    await q`CREATE INDEX IF NOT EXISTS walk_ledger_user ON walk_ledger (user_id, created_at DESC)`;
    await q`CREATE INDEX IF NOT EXISTS walk_ledger_stale ON walk_ledger (created_at) WHERE status = 'reserved'`;
    // What was bought, one row per payment (lib/billing/fulfil.ts). The unique
    // Stripe ids make granting idempotent: a webhook and the success page
    // both fulfilling one checkout grant it once.
    await q`
      CREATE TABLE IF NOT EXISTS purchases (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        product text NOT NULL CHECK (product IN ('single', 'city72h', 'trip7d', 'annual')),
        checkout_session text UNIQUE,
        payment_intent text UNIQUE,
        invoice text UNIQUE,
        amount_total int NOT NULL,
        currency text NOT NULL,
        promo boolean NOT NULL DEFAULT false,
        granted jsonb NOT NULL,
        status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'partial_refund', 'disputed')),
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await q`CREATE INDEX IF NOT EXISTS purchases_user ON purchases (user_id, created_at DESC)`;
    // Webhook deliveries seen, so a retried or replayed event is handled once.
    await q`
      CREATE TABLE IF NOT EXISTS stripe_events (
        id text PRIMARY KEY,
        type text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        error text
      )`;
  })().catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  return ready;
}

// ---------------------------------------------------------------- who

export type Who = {
  /** The Clerk user, when signed in. */
  userId: string | null;
  /** Hashed identities that share one free walk: the browser, and the account. */
  subjects: string[];
  kinds: ("d" | "u")[];
  /** The person the rate limits use, hashed — for the ledger. */
  person: string;
  /** The address, hashed — for the free-walk backstop. */
  ip: string;
};

/** Who is asking, from the headers the proxy signed (proxy.ts). Null when it did not. */
export async function whoIs(headers: Headers): Promise<Who | null> {
  const person = await verifyPerson(headers.get(PERSON_HEADER));
  const device = await verifyPerson(headers.get(DEVICE_HEADER));
  if (!person || !device) return null;
  const userId = person.startsWith("u:") ? person.slice(2) : null;
  const ipRaw = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
  const ids: [string, "d" | "u"][] = [[`free|${device}`, "d"]];
  if (userId) ids.push([`free|u:${userId}`, "u"]);
  // Sorted, so two requests claiming the same free walk lock the same rows in
  // the same order and the second waits for the first instead of deadlocking.
  const hashedIds = ids.map(([id, k]) => [hashed(id), k] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    userId,
    subjects: hashedIds.map(([s]) => s),
    kinds: hashedIds.map(([, k]) => k),
    person: hashed(`person|${person}`),
    ip: hashed(`ip|${ipRaw}`),
  };
}

// ------------------------------------------------------------- status

type EntitlementRow = {
  credits: number;
  bonus_credits: number;
  pass_kind: string | null;
  pass_until: string | null;
  pass_day: string | null;
  pass_day_used: number;
  sub_status: string | null;
  sub_until: string | null;
  sub_cancel_at_period_end: boolean;
  sub_month: string | null;
  sub_month_used: number;
};

export type WalkStatus = {
  canWalk: boolean;
  /** What the next walk would come out of. */
  source: WalkSource | null;
  reason: PaywallReason | null;
  freeWalkLeft: boolean;
  credits: number;
  bonusCredits: number;
  pass: { kind: string; until: string; usedToday: number; perDay: number } | null;
  annual: { status: string; until: string; cancelling: boolean; usedThisMonth: number; perMonth: number } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

function decide(freeUsed: boolean, ipFree: number, who: Who, e: EntitlementRow | null): Omit<WalkStatus, "freeWalkLeft"> {
  const now = Date.now();
  const passActive = !!e?.pass_until && Date.parse(e.pass_until) > now;
  const passUsedToday = passActive && e?.pass_day?.slice(0, 10) === today() ? e.pass_day_used : 0;
  const subActive =
    !!e?.sub_status && ["active", "trialing", "past_due"].includes(e.sub_status) && !!e.sub_until && Date.parse(e.sub_until) > now;
  const subUsed = subActive && e?.sub_month === thisMonth() ? e.sub_month_used : 0;
  const pass = passActive
    ? { kind: e!.pass_kind ?? "pass", until: e!.pass_until!, usedToday: passUsedToday, perDay: PASS_WALKS_PER_DAY }
    : null;
  const annual = subActive
    ? { status: e!.sub_status!, until: e!.sub_until!, cancelling: e!.sub_cancel_at_period_end, usedThisMonth: subUsed, perMonth: ANNUAL_WALKS_PER_MONTH }
    : null;
  const base = { credits: e?.credits ?? 0, bonusCredits: e?.bonus_credits ?? 0, pass, annual };

  let source: WalkSource | null = null;
  if (!freeUsed && (who.userId || ipFree < FREE_PER_ADDRESS_PER_DAY)) source = "free";
  else if (who.userId && passActive && passUsedToday < PASS_WALKS_PER_DAY) source = "pass";
  else if (who.userId && subActive && subUsed < ANNUAL_WALKS_PER_MONTH) source = "annual";
  else if (who.userId && (e?.credits ?? 0) > 0) source = "credit";
  else if (who.userId && (e?.bonus_credits ?? 0) > 0) source = "bonus";

  let reason: PaywallReason | null = null;
  if (!source) {
    if (!freeUsed && !who.userId) reason = "signin_for_free";
    else if (!who.userId) reason = "signin";
    else if (passActive) reason = "fair_use_pass";
    else if (subActive) reason = "fair_use_annual";
    else reason = "no_walks";
  }
  return { canWalk: !!source, source, reason, ...base };
}

/** What this person could build next, without changing anything. */
export async function walkStatus(who: Who): Promise<WalkStatus> {
  await ensureSchema();
  const q = sql();
  const [used] = (await q`
    SELECT
      (SELECT count(*) FROM free_walks WHERE subject = ANY(${who.subjects}::text[]))::int AS n,
      (SELECT count(*) FROM free_walks WHERE kind = 'd' AND ip_hash = ${who.ip}
         AND created_at > now() - interval '24 hours')::int AS ip`) as { n: number; ip: number }[];
  // Dates as text: the driver turns them into Date objects in the server's
  // time zone, and a pass day must not move by a timezone.
  const rows = who.userId
    ? ((await q`
        SELECT credits, bonus_credits, pass_kind, pass_until::text, pass_day::text, pass_day_used,
               sub_status, sub_until::text, sub_cancel_at_period_end, sub_month, sub_month_used
        FROM entitlements WHERE user_id = ${who.userId}`) as EntitlementRow[])
    : [];
  const status = decide(used.n > 0, used.ip, who, rows[0] ?? null);
  return { ...status, freeWalkLeft: used.n === 0 };
}

// ------------------------------------------------------------ consume

/**
 * Takes one walk for this person, or returns null when they have none.
 *
 * Safe against two builds at once: the free walk is claimed in one statement
 * whose unique keys make the second claim find it taken; the paid sources are
 * decided on the person's entitlement row with that row locked, so two builds
 * on the last credit or the third walk of the day cannot both get it.
 */
export async function consumeWalk(who: Who, walkId: string, treatment: "enforce" | "free"): Promise<WalkSource | null> {
  await ensureSchema();
  const q = sql();

  // A developer: booked, never stopped.
  if (treatment === "free") {
    await q`INSERT INTO walk_ledger (walk_id, user_id, person_hash, source) VALUES (${walkId}, ${who.userId}, ${who.person}, 'dev')`;
    return "dev";
  }

  // The free walk. Also marks every identity seen here as used when one of
  // them already was — that is the sign-in merge, with no separate step.
  const free = (await q`
    WITH prior AS (SELECT count(*) AS n FROM free_walks WHERE subject = ANY(${who.subjects}::text[])),
    ipuse AS (SELECT count(*) AS n FROM free_walks
              WHERE kind = 'd' AND ip_hash = ${who.ip} AND created_at > now() - interval '24 hours'),
    ok AS (SELECT (${!!who.userId}::boolean OR (SELECT n FROM ipuse) < ${FREE_PER_ADDRESS_PER_DAY}) AS v),
    ins AS (
      INSERT INTO free_walks (subject, kind, walk_id, ip_hash)
      SELECT s, k, CASE WHEN (SELECT n FROM prior) = 0 THEN ${walkId}::uuid END, ${who.ip}
      FROM unnest(${who.subjects}::text[], ${who.kinds}::text[]) AS t(s, k)
      WHERE (SELECT n FROM prior) > 0 OR (SELECT v FROM ok)
      ORDER BY s
      ON CONFLICT (subject) DO NOTHING
      RETURNING subject)
    INSERT INTO walk_ledger (walk_id, user_id, person_hash, source)
    SELECT ${walkId}::uuid, ${who.userId}, ${who.person}, 'free'
    WHERE (SELECT n FROM prior) = 0 AND (SELECT v FROM ok)
      AND (SELECT count(*) FROM ins) = cardinality(${who.subjects}::text[])
    RETURNING source`) as { source: WalkSource }[];
  if (free.length) return "free";
  if (!who.userId) return null;

  // Paid sources, on the locked entitlement row. Two statements in one
  // transaction: the first takes the lock, and the second — reading a fresh
  // snapshot after it — decides, takes the walk and books it.
  const day = today();
  const month = thisMonth();
  const [, taken] = (await q.transaction([
    q`INSERT INTO entitlements (user_id) VALUES (${who.userId})
      ON CONFLICT (user_id) DO UPDATE SET updated_at = entitlements.updated_at`,
    q`WITH d AS (
        SELECT user_id, CASE
          WHEN pass_until > now() AND (pass_day IS DISTINCT FROM ${day}::date OR pass_day_used < ${PASS_WALKS_PER_DAY}) THEN 'pass'
          WHEN sub_status IN ('active', 'trialing', 'past_due') AND sub_until > now()
               AND (sub_month IS DISTINCT FROM ${month} OR sub_month_used < ${ANNUAL_WALKS_PER_MONTH}) THEN 'annual'
          WHEN credits > 0 THEN 'credit'
          WHEN bonus_credits > 0 THEN 'bonus' END AS src
        FROM entitlements WHERE user_id = ${who.userId}),
      upd AS (
        UPDATE entitlements e SET
          pass_day_used = CASE WHEN d.src = 'pass'
            THEN (CASE WHEN e.pass_day = ${day}::date THEN e.pass_day_used ELSE 0 END) + 1 ELSE e.pass_day_used END,
          pass_day = CASE WHEN d.src = 'pass' THEN ${day}::date ELSE e.pass_day END,
          sub_month_used = CASE WHEN d.src = 'annual'
            THEN (CASE WHEN e.sub_month = ${month} THEN e.sub_month_used ELSE 0 END) + 1 ELSE e.sub_month_used END,
          sub_month = CASE WHEN d.src = 'annual' THEN ${month} ELSE e.sub_month END,
          credits = e.credits - (d.src = 'credit')::int,
          bonus_credits = e.bonus_credits - (d.src = 'bonus')::int,
          updated_at = now()
        FROM d WHERE e.user_id = d.user_id AND d.src IS NOT NULL
        RETURNING d.src)
      INSERT INTO walk_ledger (walk_id, user_id, person_hash, source)
      SELECT ${walkId}::uuid, ${who.userId}, ${who.person}, src FROM upd
      RETURNING source`,
  ])) as [unknown, { source: WalkSource }[]];
  return taken[0]?.source ?? null;
}

/**
 * Books a walk for the record without taking anything — shadow mode. The
 * source is what it would have come out of, or 'none' where the paywall would
 * have stopped it.
 */
export async function recordShadowWalk(who: Who, walkId: string): Promise<WalkSource | null> {
  const status = await walkStatus(who);
  await sql()`
    INSERT INTO walk_ledger (walk_id, user_id, person_hash, source, status)
    VALUES (${walkId}, ${who.userId}, ${who.person}, ${status.source ?? "none"}, 'shadow')`;
  return status.source;
}

// ------------------------------------------------------ deliver/refund

/** A stop's position, rounded to ~1 m: enough to check an arrival against, no more. */
const at5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Where a walk is, for the "first walk in a new city" bonus. From the city the
 * walker chose — its centre, to ~10 km — or their start when there is none;
 * never a name, because "Wien" and "Vienna" are one city.
 */
function cityOf(req: TourRequest): { key: string; label: string | null } {
  const c = req.city ?? { lat: req.start.lat, lng: req.start.lng, name: undefined };
  return { key: `${Math.round(c.lat * 10)}|${Math.round(c.lng * 10)}`, label: req.city?.name ?? null };
}

/** The walker has the walk: keep what a completion will be checked against. */
export async function markDelivered(
  walkId: string,
  plan: TourPlan,
  req: TourRequest,
  meters: number,
  rides: TourRide[],
): Promise<void> {
  const city = cityOf(req);
  const stops = JSON.stringify(plan.stops.map((s) => [at5(s.lat), at5(s.lng)]));
  await sql()`
    UPDATE walk_ledger SET
      status = CASE WHEN status = 'shadow' THEN 'shadow' ELSE 'delivered' END,
      delivered_at = now(), stop_count = ${plan.stops.length}, stops = ${stops}::jsonb,
      plan_meters = ${Math.round(meters)}, has_rides = ${rides.length > 0},
      city_key = ${city.key}, city_label = ${city.label}
    WHERE walk_id = ${walkId} AND status IN ('reserved', 'shadow')`;
}

/** The build failed after the walk was taken: give it back. Idempotent. */
export async function refundWalk(walkId: string): Promise<void> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`
    UPDATE walk_ledger SET status = 'refunded'
    WHERE walk_id = ${walkId} AND status = 'reserved'
    RETURNING source, user_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day`) as {
    source: WalkSource;
    user_id: string | null;
    day: string;
  }[];
  const r = rows[0];
  if (!r) return;
  const day = r.day;
  if (r.source === "free") {
    await q`DELETE FROM free_walks WHERE walk_id = ${walkId}`;
  } else if (r.user_id && r.source === "credit") {
    await q`UPDATE entitlements SET credits = credits + 1, updated_at = now() WHERE user_id = ${r.user_id}`;
  } else if (r.user_id && r.source === "bonus") {
    await q`UPDATE entitlements SET bonus_credits = bonus_credits + 1, updated_at = now() WHERE user_id = ${r.user_id}`;
  } else if (r.user_id && r.source === "pass") {
    await q`UPDATE entitlements SET pass_day_used = GREATEST(pass_day_used - 1, 0), updated_at = now()
            WHERE user_id = ${r.user_id} AND pass_day = ${day}::date`;
  } else if (r.user_id && r.source === "annual") {
    await q`UPDATE entitlements SET sub_month_used = GREATEST(sub_month_used - 1, 0), updated_at = now()
            WHERE user_id = ${r.user_id} AND sub_month = ${day.slice(0, 7)}`;
  }
}

/**
 * Walks left reserved by a build that was killed before it could refund (a
 * function timing out sends no error). Given back after ten minutes.
 */
export async function refundStaleWalks(userId?: string): Promise<number> {
  await ensureSchema();
  const rows = (userId
    ? await sql()`SELECT walk_id FROM walk_ledger WHERE status = 'reserved' AND user_id = ${userId}
                   AND created_at < now() - interval '10 minutes'`
    : await sql()`SELECT walk_id FROM walk_ledger WHERE status = 'reserved'
                   AND created_at < now() - interval '10 minutes' LIMIT 500`) as { walk_id: string }[];
  for (const r of rows) await refundWalk(r.walk_id);
  return rows.length;
}
