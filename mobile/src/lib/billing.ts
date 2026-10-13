/**
 * Buying walks from the phone (the website's lib/billing).
 *
 * Expo Go cannot sell through the App Store, so the phone opens the website's
 * Stripe checkout in an in-app browser, signed in with this app's account
 * (bearer token), and asks the website what the account has afterwards. The
 * product list mirrors the website's lib/billing/products.ts.
 */

import * as WebBrowser from "expo-web-browser";
import { authHeader } from "./accounts";
import { BASE } from "./api";

export type ProductId = "single" | "city72h" | "trip7d" | "annual";

export type Product = {
  id: ProductId;
  name: string;
  badge: string;
  tagline: string;
  headline: string;
  per: string;
  small: string;
  /** Against single walks at €4.99 with every walk used — hence "up to". */
  saving: string | null;
  /** SF Symbol names. */
  features: { symbol: string; text: string }[];
};

/** The paywall cards, in the order a traveller thinks: a few days, a week, a year, just one. */
export const PRODUCTS: Product[] = [
  {
    id: "city72h",
    name: "City Pass",
    badge: "BEST FOR A CITY BREAK",
    tagline: "See a city your way, three days of walks.",
    headline: "€9.99",
    per: "/ 72 hours",
    small: "from €1.11 a walk",
    saving: "SAVE UP TO 78%",
    features: [
      { symbol: "calendar", text: "Up to 3 walks a day for 72 hours" },
      { symbol: "creditcard", text: "One payment — doesn't renew" },
    ],
  },
  {
    id: "trip7d",
    name: "Trip Pass",
    badge: "BEST FOR A WEEK AWAY",
    tagline: "A whole trip of walks, wherever it takes you.",
    headline: "€14.99",
    per: "/ 7 days",
    small: "from €0.71 a walk",
    saving: "SAVE UP TO 86%",
    features: [
      { symbol: "calendar", text: "Up to 3 walks a day for 7 days" },
      { symbol: "creditcard", text: "One payment — doesn't renew" },
    ],
  },
  {
    id: "annual",
    name: "Annual",
    badge: "FOR LOCALS & REGULARS",
    tagline: "Walks all year — at home and on every trip.",
    headline: "€3.33",
    per: "/ month",
    small: "€39.99 billed yearly",
    saving: "SAVE UP TO 93%",
    features: [
      { symbol: "infinity", text: "Up to 10 walks every month" },
      { symbol: "mappin.and.ellipse", text: "Any city — cancel any time" },
    ],
  },
  {
    id: "single",
    name: "One walk",
    badge: "JUST ONE MORE",
    tagline: "One more walk, written for wherever you are.",
    headline: "€4.99",
    per: "/ walk",
    small: "Use it whenever you like",
    saving: null,
    features: [
      { symbol: "clock", text: "Never expires" },
      { symbol: "sparkles", text: "Every stop written for you" },
    ],
  },
];

export type WalkStatus = { enabled: boolean; signedIn: boolean; canWalk: boolean; reason?: string | null };

export async function walkStatus(): Promise<WalkStatus> {
  try {
    const res = await fetch(`${BASE}/api/billing/status`, { headers: await authHeader() });
    return res.ok ? ((await res.json()) as WalkStatus) : { enabled: false, signedIn: false, canWalk: true };
  } catch {
    return { enabled: false, signedIn: false, canWalk: true };
  }
}

/** Opens Stripe's checkout for a product; resolves when the browser closes. Throws the website's words. */
export async function buy(product: ProductId): Promise<void> {
  const res = await fetch(`${BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ product }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "Checkout isn't available right now.");
  await WebBrowser.openBrowserAsync(body.url);
}
