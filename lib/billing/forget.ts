/**
 * What deleting an account does to its walks, payments and points.
 *
 *  1. The Stripe customer is deleted first, which cancels any subscription at
 *     once. If Stripe cannot be reached, nothing else happens and the caller
 *     reports the failure — an account must never be deleted while it can
 *     still be charged.
 *  2. What the person had (walks left, passes, plan, points) goes.
 *  3. Walks booked stay in the ledger without the account, and purchases stay
 *     under a one-way code: accounting law keeps sales records for ten years.
 *  4. The hashed "free walk used" mark stays, so deleting and signing up again
 *     is not a second free walk (said in the privacy policy).
 *
 * Server-only.
 */

import { hashed } from "@/lib/rateLimit";
import { forgetLoyalty } from "./loyalty";
import { ensureSchema, sql } from "./store";
import { stripe } from "./stripe";

export async function forgetBilling(userId: string): Promise<void> {
  await ensureSchema();
  const q = sql();
  const [ent] = (await q`SELECT stripe_customer FROM entitlements WHERE user_id = ${userId}`) as {
    stripe_customer: string | null;
  }[];
  if (ent?.stripe_customer) {
    const s = stripe();
    if (!s) throw new Error("Payments can't be reached to cancel this account's plan.");
    try {
      await s.customers.del(ent.stripe_customer);
    } catch (err) {
      // Already gone is fine; anything else stops the deletion.
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") throw err;
    }
  }
  const pseudonym = `deleted:${hashed(`user|${userId}`)}`;
  await q`DELETE FROM entitlements WHERE user_id = ${userId}`;
  await q`UPDATE walk_ledger SET user_id = NULL WHERE user_id = ${userId}`;
  await q`UPDATE purchases SET user_id = ${pseudonym} WHERE user_id = ${userId}`;
  await forgetLoyalty(userId);
}
