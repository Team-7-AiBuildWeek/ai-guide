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

export const PRODUCTS: { id: ProductId; name: string; price: string; detail: string; perWalk: string }[] = [
  { id: "single", name: "One walk", price: "€4.99", detail: "Use it whenever you like — it never expires.", perWalk: "€4.99 a walk" },
  { id: "city72h", name: "City Pass", price: "€9.99", detail: "72 hours, up to 3 walks a day. Doesn't renew.", perWalk: "from €1.11 a walk" },
  { id: "trip7d", name: "Trip Pass", price: "€14.99", detail: "7 days, up to 3 walks a day. Doesn't renew.", perWalk: "from €0.71 a walk" },
  { id: "annual", name: "Annual", price: "€39.99 a year", detail: "€3.33 a month, billed yearly. Up to 10 walks a month.", perWalk: "from €0.33 a walk" },
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
