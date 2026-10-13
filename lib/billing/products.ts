/**
 * What WalkDots sells — the one list the paywall shows and checkout charges
 * from (app/api/billing/checkout). Prices are display strings; what is
 * actually charged is the Stripe price with the same lookup key, so the two
 * are kept in step by hand when a price changes.
 *
 * Passes are one-time payments that simply run out — tourists should not be
 * left on a renewing plan they forgot about. Only the annual plan renews.
 *
 * Safe to import in the browser.
 */

export type ProductId = "single" | "city72h" | "trip7d" | "annual";

export type Product = {
  id: ProductId;
  /** Stripe price lookup key, the same in test and live mode. */
  lookupKey: string;
  name: string;
  price: string;
  /** What it gives, in one line. */
  detail: string;
  /** The honest lowest cost of a walk on it. */
  perWalk: string;
  /** Stripe Checkout mode. */
  mode: "payment" | "subscription";
  /** What a paid checkout grants (lib/billing/fulfil.ts). */
  grants: { credits?: number; passSeconds?: number; passKind?: "city72h" | "trip7d"; subscription?: true };
};

export const PRODUCTS: Product[] = [
  {
    id: "single",
    lookupKey: "wd_single",
    name: "One walk",
    price: "€4.99",
    detail: "Use it whenever you like — it never expires.",
    perWalk: "€4.99 a walk",
    mode: "payment",
    grants: { credits: 1 },
  },
  {
    id: "city72h",
    lookupKey: "wd_city72h",
    name: "City Pass",
    price: "€9.99",
    detail: "72 hours, up to 3 walks a day. Doesn't renew.",
    perWalk: "from €1.11 a walk",
    mode: "payment",
    grants: { passSeconds: 72 * 3600, passKind: "city72h" },
  },
  {
    id: "trip7d",
    lookupKey: "wd_trip7d",
    name: "Trip Pass",
    price: "€14.99",
    detail: "7 days, up to 3 walks a day. Doesn't renew.",
    perWalk: "from €0.71 a walk",
    mode: "payment",
    grants: { passSeconds: 7 * 24 * 3600, passKind: "trip7d" },
  },
  {
    id: "annual",
    lookupKey: "wd_annual",
    name: "Annual",
    price: "€39.99 a year",
    detail: "€3.33 a month, billed yearly. Up to 10 walks a month. Cancel any time.",
    perWalk: "from €0.33 a walk",
    mode: "subscription",
    grants: { subscription: true },
  },
];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
