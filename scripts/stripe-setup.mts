/**
 * Creates WalkDots' products and prices in Stripe, once per account/mode.
 *
 *   (set -a; . <env file with STRIPE_SECRET_KEY>; set +a; npx tsx --tsconfig tsconfig.json scripts/stripe-setup.mts)
 *
 * Prices are EUR, VAT included (tax_behavior inclusive), with the lookup keys
 * the app charges by (lib/billing/products.ts). Safe to run again: a lookup
 * key that already has an active price is left alone. To change a price,
 * create the new one with `transfer_lookup_key` in the dashboard, or archive
 * the old one and run this again.
 */

import Stripe from "stripe";
import { PRODUCTS } from "../lib/billing/products";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}
const stripe = new Stripe(key);
console.log(`Stripe mode: ${key.startsWith("sk_live") ? "LIVE" : "test"}`);

/** Cents, from the display price ("€9.99" → 999). */
const cents = (price: string) => Math.round(parseFloat(price.replace(/[^0-9.]/g, "")) * 100);

for (const p of PRODUCTS) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    console.log(`= ${p.lookupKey}: already ${existing.data[0].id} (${existing.data[0].unit_amount} ${existing.data[0].currency})`);
    continue;
  }
  const product = await stripe.products.create({
    name: `WalkDots — ${p.name}`,
    description: p.detail,
    metadata: { walkdots_product: p.id },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: cents(p.price),
    tax_behavior: "inclusive",
    lookup_key: p.lookupKey,
    ...(p.mode === "subscription" ? { recurring: { interval: "year" as const } } : {}),
    metadata: { walkdots_product: p.id },
  });
  console.log(`+ ${p.lookupKey}: ${price.id} (${price.unit_amount} eur${p.mode === "subscription" ? "/year" : ""})`);
}
process.exit(0);
