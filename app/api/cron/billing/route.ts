/**
 * Daily housekeeping for the paywall and points, run by Vercel Cron
 * (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 *
 *  - Gives back walks left reserved by builds that were killed mid-way.
 *  - Expires points untouched for a year.
 *  - Forgets Stripe webhook deliveries older than 30 days (kept only to stop
 *    a retried delivery being handled twice).
 */

import { config } from "@/lib/config";
import { refundStaleWalks, sql } from "@/lib/billing/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!config.workerSecret || request.headers.get("authorization") !== `Bearer ${config.workerSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.DATABASE_URL) return Response.json({ skipped: "no database" });
  const refunded = await refundStaleWalks();
  const q = sql();
  const expired = (await q`
    WITH a AS (
      SELECT user_id, balance, last_activity_at FROM loyalty_accounts
      WHERE balance > 0 AND last_activity_at < now() - interval '12 months' LIMIT 1000),
    ev AS (
      INSERT INTO loyalty_events (user_id, kind, ref, points)
      SELECT user_id, 'expire', last_activity_at::text, -balance FROM a
      ON CONFLICT DO NOTHING RETURNING user_id)
    UPDATE loyalty_accounts SET balance = 0 FROM ev WHERE loyalty_accounts.user_id = ev.user_id
    RETURNING loyalty_accounts.user_id`.catch(() => [])) as unknown[];
  const purged = (await q`DELETE FROM stripe_events WHERE received_at < now() - interval '30 days' RETURNING id`.catch(
    () => [],
  )) as unknown[];
  return Response.json({ refunded, expired: expired.length, purged: purged.length });
}
