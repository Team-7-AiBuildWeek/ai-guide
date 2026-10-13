/** Stripe's own page for the annual plan: change card, see receipts, cancel. Signed in only. */

import { ensureSchema, sql, whoIs } from "@/lib/billing/store";
import { siteOrigin, stripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = stripe();
  if (!s) return Response.json({ error: "Payments aren't open yet." }, { status: 503 });
  const who = await whoIs(request.headers);
  if (!who?.userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  await ensureSchema();
  const [ent] = (await sql()`SELECT stripe_customer FROM entitlements WHERE user_id = ${who.userId}`) as {
    stripe_customer: string | null;
  }[];
  if (!ent?.stripe_customer) return Response.json({ error: "Nothing bought on this account yet." }, { status: 404 });
  const portal = await s.billingPortal.sessions.create({
    customer: ent.stripe_customer,
    return_url: `${siteOrigin(request)}/profile`,
  });
  return Response.json({ url: portal.url });
}
