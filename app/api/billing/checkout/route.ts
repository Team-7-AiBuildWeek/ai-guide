/**
 * Start buying: a Stripe Checkout page for one product (lib/billing/products.ts).
 *
 * Signed in only — what is bought belongs to the account, so it follows the
 * walker to their phone. Works with the website's session and with the
 * iPhone app's bearer token alike (the proxy reads both). The app opens the
 * returned page in an in-app browser.
 *
 * Which payment methods appear is set in the Stripe dashboard (this API
 * version has no per-session list). Keep it to cards and wallets: a bank
 * payment that clears days later leaves a walker on a street corner with a
 * walk they cannot use yet. If one is enabled anyway, the webhook still grants
 * it when it clears (checkout.session.async_payment_succeeded).
 */

import { clerkClient } from "@clerk/nextjs/server";
import { productById } from "@/lib/billing/products";
import { ensureSchema, sql, whoIs } from "@/lib/billing/store";
import { priceFor, siteOrigin, stripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/** Said under the pay button: digital content starts at once (EU withdrawal rules). */
const WAIVER =
  "Your walks are available straight away. By paying you agree they start now, so the 14-day right to withdraw no longer applies once a pass or plan has started. Unused single walks can be refunded within 14 days.";

export async function POST(request: Request) {
  const s = stripe();
  if (!s) return Response.json({ error: "Payments aren't open yet." }, { status: 503 });
  const who = await whoIs(request.headers);
  if (!who?.userId) return Response.json({ error: "Sign in to buy walks." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { product?: string };
  const product = productById(body.product ?? "");
  if (!product) return Response.json({ error: "Unknown product." }, { status: 400 });

  await ensureSchema();
  const [ent] = (await sql()`
    SELECT stripe_customer, sub_status, sub_until::text FROM entitlements WHERE user_id = ${who.userId}`) as {
    stripe_customer: string | null;
    sub_status: string | null;
    sub_until: string | null;
  }[];
  const origin = siteOrigin(request);

  // Already on the annual plan: managing it, not buying it twice.
  if (
    product.mode === "subscription" &&
    ent?.sub_status &&
    ["active", "trialing", "past_due"].includes(ent.sub_status) &&
    ent.sub_until &&
    Date.parse(ent.sub_until) > Date.now()
  ) {
    if (!ent.stripe_customer) return Response.json({ error: "You already have the annual plan." }, { status: 409 });
    const portal = await s.billingPortal.sessions.create({ customer: ent.stripe_customer, return_url: `${origin}/profile` });
    return Response.json({ url: portal.url, portal: true });
  }

  // One Stripe customer per account, made the first time they buy.
  let customer = ent?.stripe_customer ?? null;
  if (!customer) {
    const user = await (await clerkClient()).users.getUser(who.userId).catch(() => null);
    const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
    const created = await s.customers.create(
      { email, metadata: { clerk_user_id: who.userId } },
      { idempotencyKey: `customer-${who.userId}` },
    );
    customer = created.id;
    await sql()`
      INSERT INTO entitlements (user_id, stripe_customer) VALUES (${who.userId}, ${customer})
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer = COALESCE(entitlements.stripe_customer, EXCLUDED.stripe_customer)`;
  }

  const metadata = { product: product.id, clerk_user_id: who.userId };
  const session = await s.checkout.sessions.create({
    mode: product.mode,
    customer,
    client_reference_id: who.userId,
    line_items: [{ price: await priceFor(product.id), quantity: 1 }],
    metadata,
    ...(product.mode === "payment"
      ? { payment_intent_data: { metadata } }
      : { subscription_data: { metadata } }),
    allow_promotion_codes: true,
    // Turned on once Stripe Tax and the terms URL are set up in the Stripe
    // dashboard; asking for either before that makes Checkout refuse.
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true } } : {}),
    ...(process.env.STRIPE_TERMS_CONSENT === "1" ? { consent_collection: { terms_of_service: "required" as const } } : {}),
    custom_text: { submit: { message: WAIVER } },
    success_url: `${origin}/billing/done?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
  });
  return Response.json({ url: session.url });
}
