/**
 * Stripe telling us what happened to a payment. Outside the proxy (Stripe is
 * not a person); trusted only by its signature. Every event is handled once —
 * a retried or replayed delivery finds it in stripe_events and stops — and
 * every grant is idempotent anyway (lib/billing/fulfil.ts).
 *
 * A handler that throws answers 500, and Stripe tries again later.
 */

import type Stripe from "stripe";
import { fulfilSession, recordInvoice, revokePayment, syncSubscription } from "@/lib/billing/fulfil";
import { ensureSchema, sql } from "@/lib/billing/store";
import { stripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("Stripe is not configured.", { status: 503 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  await ensureSchema();
  const fresh = (await sql()`
    INSERT INTO stripe_events (id, type) VALUES (${event.id}, ${event.type})
    ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
    RETURNING processed_at`) as { processed_at: string | null }[];
  if (fresh[0]?.processed_at) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfilSession(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object.id);
        break;
      case "invoice.paid":
        await recordInvoice(event.data.object);
        break;
      case "invoice.payment_failed": {
        const sub = event.data.object.parent?.subscription_details?.subscription;
        const id = typeof sub === "string" ? sub : sub?.id;
        if (id) await syncSubscription(id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        // Full refunds only; a partial refund is goodwill.
        if (pi && charge.refunded) await revokePayment(pi, "refunded");
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        if (pi) await revokePayment(pi, "disputed");
        break;
      }
      default:
        break;
    }
    await sql()`UPDATE stripe_events SET processed_at = now(), error = NULL WHERE id = ${event.id}`;
    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[billing] webhook ${event.type} failed:`, message);
    await sql()`UPDATE stripe_events SET error = ${message.slice(0, 500)} WHERE id = ${event.id}`.catch(() => {});
    return new Response("Handler failed.", { status: 500 });
  }
}
