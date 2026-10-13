/**
 * The success page's half of fulfilment: the walker is back from Stripe, and
 * may well be faster than Stripe's webhook. Retrieves the session and grants
 * it — the same idempotent grant the webhook makes (lib/billing/fulfil.ts), so
 * whichever arrives second changes nothing.
 *
 * No sign-in needed: the session id is unguessable and comes straight from
 * Stripe's redirect, which also makes this work from the iPhone app's browser.
 */

import { fulfilSession } from "@/lib/billing/fulfil";
import { stripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = stripe();
  if (!s) return Response.json({ error: "Payments aren't open yet." }, { status: 503 });
  const { session_id } = (await request.json().catch(() => ({}))) as { session_id?: string };
  if (!session_id?.startsWith("cs_")) return Response.json({ error: "Missing checkout." }, { status: 400 });
  try {
    const session = await s.checkout.sessions.retrieve(session_id);
    const granted = await fulfilSession(session);
    return Response.json({ paid: granted, product: session.metadata?.product ?? null });
  } catch (err) {
    console.error("[billing] confirm failed:", err);
    return Response.json({ error: "We couldn't confirm that payment yet." }, { status: 502 });
  }
}
