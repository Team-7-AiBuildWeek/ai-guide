/**
 * Turning payments into walks, and taking them back.
 *
 * Called from two places for the same checkout — the Stripe webhook and the
 * success page (app/api/billing/confirm), whichever arrives first — so every
 * grant is idempotent: the purchase row's unique Stripe ids decide whether
 * this payment has been granted already.
 *
 *  - Single walk: +1 credit (never expires).
 *  - City / Trip Pass: the pass runs from now, or from when the current one
 *    ends, so a second pass extends the first instead of overlapping it.
 *  - Annual: the subscription's state is copied from Stripe every time it
 *    changes — always re-fetched, so events arriving out of order are harmless.
 *  - A full refund or a dispute takes the grant back; a partial refund is
 *    goodwill and takes nothing.
 *
 * Server-only.
 */

import type Stripe from "stripe";
import { productById, type ProductId } from "./products";
import { ensureSchema, sql } from "./store";
import { clawBackReferral, rewardReferral } from "./loyalty";
import { stripe } from "./stripe";

/** Grants a paid Checkout Session to its buyer. Returns false when it is not paid (yet). */
export async function fulfilSession(session: Stripe.Checkout.Session): Promise<boolean> {
  const userId = session.client_reference_id;
  const productId = (session.metadata?.product ?? "") as ProductId;
  const product = productById(productId);
  if (!userId || !product) throw new Error(`Checkout ${session.id} has no buyer or product.`);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (product.mode === "subscription") {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subId) return false;
    await ensureSchema();
    await sql()`
      INSERT INTO entitlements (user_id, stripe_customer, sub_id) VALUES (${userId}, ${customer}, ${subId})
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_customer = COALESCE(entitlements.stripe_customer, EXCLUDED.stripe_customer),
        sub_id = EXCLUDED.sub_id, updated_at = now()`;
    await syncSubscription(subId);
    return true;
  }

  if (session.payment_status !== "paid") return false;
  await ensureSchema();
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const credits = product.grants.credits ?? 0;
  const passSeconds = product.grants.passSeconds ?? 0;
  const passKind = product.grants.passKind ?? null;
  const promo = (session.total_details?.amount_discount ?? 0) > 0 || (session.amount_total ?? 0) === 0;
  const granted = JSON.stringify(product.grants);
  // A walk given away by a promotion is a bonus walk: it earns no points.
  const paidCredits = promo ? 0 : credits;
  const bonusCredits = promo ? credits : 0;

  await sql()`
    WITH p AS (
      INSERT INTO purchases (user_id, product, checkout_session, payment_intent, amount_total, currency, promo, granted)
      VALUES (${userId}, ${product.id}, ${session.id}, ${pi}, ${session.amount_total ?? 0}, ${session.currency ?? "eur"},
              ${promo}, ${granted}::jsonb)
      ON CONFLICT (checkout_session) DO NOTHING
      RETURNING user_id)
    INSERT INTO entitlements (user_id, credits, bonus_credits, pass_kind, pass_until, stripe_customer)
    SELECT user_id, ${paidCredits}, ${bonusCredits}, ${passKind},
           CASE WHEN ${passSeconds}::int > 0 THEN now() + make_interval(secs => ${passSeconds}::int) END,
           ${customer}
    FROM p
    ON CONFLICT (user_id) DO UPDATE SET
      credits = entitlements.credits + EXCLUDED.credits,
      bonus_credits = entitlements.bonus_credits + EXCLUDED.bonus_credits,
      pass_kind = COALESCE(EXCLUDED.pass_kind, entitlements.pass_kind),
      pass_until = CASE WHEN ${passSeconds}::int > 0
        THEN GREATEST(COALESCE(entitlements.pass_until, now()), now()) + make_interval(secs => ${passSeconds}::int)
        ELSE entitlements.pass_until END,
      stripe_customer = COALESCE(entitlements.stripe_customer, EXCLUDED.stripe_customer),
      updated_at = now()`;
  // Someone they invited has paid for the first time: 500 points each.
  if (!promo && (session.amount_total ?? 0) > 0) await rewardReferral(userId);
  return true;
}

/** Copies a subscription's state from Stripe onto its owner's entitlement. */
export async function syncSubscription(subId: string): Promise<void> {
  const s = stripe();
  if (!s) return;
  const sub = await s.subscriptions.retrieve(subId);
  // The period end lives on the items in current API versions.
  const until = Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));
  await ensureSchema();
  await sql()`
    UPDATE entitlements SET
      sub_status = ${sub.status},
      sub_until = ${until ? new Date(until * 1000).toISOString() : null},
      sub_cancel_at_period_end = ${sub.cancel_at_period_end},
      updated_at = now()
    WHERE sub_id = ${sub.id}`;
}

/**
 * A renewal (or the first invoice) of the annual plan was paid: kept as a
 * purchase, for the books and for "has this person ever paid" (referrals).
 */
export async function recordInvoice(invoice: Stripe.Invoice): Promise<void> {
  const subId = invoice.parent?.subscription_details?.subscription;
  const sub = typeof subId === "string" ? subId : subId?.id;
  if (!sub || !invoice.id) return;
  await ensureSchema();
  await sql()`
    INSERT INTO purchases (user_id, product, invoice, amount_total, currency, promo, granted)
    SELECT user_id, 'annual', ${invoice.id}, ${invoice.amount_paid}, ${invoice.currency},
           ${invoice.amount_paid === 0}, '{"subscription":true}'::jsonb
    FROM entitlements WHERE sub_id = ${sub}
    ON CONFLICT (invoice) DO NOTHING`;
  await syncSubscription(sub);
  if (invoice.amount_paid > 0) {
    const [owner] = (await sql()`SELECT user_id FROM entitlements WHERE sub_id = ${sub}`) as { user_id: string }[];
    if (owner) await rewardReferral(owner.user_id);
  }
}

/**
 * Takes back what a payment granted, after a full refund or a dispute. A single
 * walk loses a credit if it still has one; a pass is shortened by its length
 * (not below now). The annual plan is refunded by cancelling it in Stripe,
 * which arrives as a subscription change instead.
 */
export async function revokePayment(paymentIntent: string, status: "refunded" | "disputed"): Promise<void> {
  await ensureSchema();
  const rows = (await sql()`
    UPDATE purchases SET status = ${status}
    WHERE payment_intent = ${paymentIntent} AND status = 'paid'
    RETURNING user_id, product, granted`) as { user_id: string; product: string; granted: { credits?: number; passSeconds?: number } }[];
  const p = rows[0];
  if (!p) return;
  const credits = p.granted.credits ?? 0;
  const passSeconds = p.granted.passSeconds ?? 0;
  await sql()`
    UPDATE entitlements SET
      credits = GREATEST(credits - ${credits}, 0),
      pass_until = CASE WHEN ${passSeconds}::int > 0 AND pass_until IS NOT NULL
        THEN GREATEST(now(), pass_until - make_interval(secs => ${passSeconds}::int)) ELSE pass_until END,
      flagged = CASE WHEN ${status} = 'disputed' THEN 'dispute' ELSE flagged END,
      updated_at = now()
    WHERE user_id = ${p.user_id}`;
  // The purchase that earned a referral reward is gone, and no other paid one
  // stands in for it: the reward goes too.
  const [{ paid }] = (await sql()`
    SELECT count(*)::int AS paid FROM purchases WHERE user_id = ${p.user_id} AND status = 'paid' AND amount_total > 0`) as {
    paid: number;
  }[];
  if (paid === 0) await clawBackReferral(p.user_id);
}
