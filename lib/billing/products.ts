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
  /** The paywall card (components/Paywall.tsx): who it is for, the big price, two lines on what it gives. */
  card: {
    badge: string;
    tagline: string;
    /** The big number and what it is per. */
    headline: string;
    per: string;
    /** Under the price. */
    small: string;
    /**
     * Against buying the same walks one by one at €4.99, if every walk is used —
     * hence "up to". Null where there is nothing honest to compare.
     */
    saving: string | null;
    features: { icon: "infinity" | "calendar" | "renew" | "clock" | "sparkle" | "pin"; text: string }[];
  };
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
    card: {
      badge: "JUST ONE MORE",
      tagline: "One more walk, written for wherever you are.",
      headline: "€4.99",
      per: "/ walk",
      small: "Use it whenever you like",
      saving: null,
      features: [
        { icon: "clock", text: "Never expires" },
        { icon: "sparkle", text: "Every stop written for you" },
      ],
    },
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
    card: {
      badge: "BEST FOR A CITY BREAK",
      tagline: "See a city your way, three days of walks.",
      headline: "€9.99",
      per: "/ 72 hours",
      small: "from €1.11 a walk",
      saving: "SAVE UP TO 78%",
      features: [
        { icon: "calendar", text: "Up to 3 walks a day for 72 hours" },
        { icon: "renew", text: "One payment — doesn't renew" },
      ],
    },
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
    card: {
      badge: "BEST FOR A WEEK AWAY",
      tagline: "A whole trip of walks, wherever it takes you.",
      headline: "€14.99",
      per: "/ 7 days",
      small: "from €0.71 a walk",
      saving: "SAVE UP TO 86%",
      features: [
        { icon: "calendar", text: "Up to 3 walks a day for 7 days" },
        { icon: "renew", text: "One payment — doesn't renew" },
      ],
    },
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
    card: {
      badge: "FOR LOCALS & REGULARS",
      tagline: "Walks all year — at home and on every trip.",
      headline: "€3.33",
      per: "/ month",
      small: "€39.99 billed yearly",
      saving: "SAVE UP TO 93%",
      features: [
        { icon: "infinity", text: "Up to 10 walks every month" },
        { icon: "pin", text: "Any city — cancel any time" },
      ],
    },
  },
];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
