/**
 * Stripe, for selling walks (lib/billing/products.ts).
 *
 * Provisioned through the Vercel Marketplace integration, which sets the keys.
 * Prices are found by lookup key (wd_single, wd_city72h, wd_trip7d, wd_annual)
 * rather than by id, so the same code charges the test prices in test mode and
 * the live ones in live mode. scripts/stripe-setup.mts creates them.
 *
 * Server-only.
 */

import Stripe from "stripe";
import { productById, type ProductId } from "./products";

let client: Stripe | null = null;

/** Null when Stripe is not set up here (a local checkout without the keys). */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

const priceCache = new Map<string, { id: string; at: number }>();
const PRICE_TTL_MS = 10 * 60_000;

/** The Stripe price for a product, by its lookup key. */
export async function priceFor(product: ProductId): Promise<string> {
  const s = stripe();
  const p = productById(product);
  if (!s || !p) throw new Error("Payments aren't set up.");
  const hit = priceCache.get(p.lookupKey);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.id;
  const list = await s.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  const id = list.data[0]?.id;
  if (!id) throw new Error(`No Stripe price with lookup key ${p.lookupKey}.`);
  priceCache.set(p.lookupKey, { id, at: Date.now() });
  return id;
}

/** The site's own address, for Stripe's return links. */
export function siteOrigin(request: Request): string {
  const configured = process.env.SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "app.walkdots.com";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
