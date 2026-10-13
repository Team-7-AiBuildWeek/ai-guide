/**
 * Who is asking, for the rate limit — a person, not an address.
 *
 * Limits keyed by IP address were limits per Wi-Fi network: a tour group on a
 * hotel's connection, or everyone a mobile carrier puts behind one address,
 * shared one allowance. So the proxy (proxy.ts) works out a person on every
 * request that spends AI credits:
 *
 *  - signed in, their account — the same allowance on every device;
 *  - otherwise, a random ID kept in an httpOnly cookie on this browser, made
 *    the first time it asks for something paid.
 *
 * and passes it to the route in a header, signed, so a client cannot simply
 * send the header itself and be someone new on every request.
 *
 * Web Crypto rather than node:crypto, because the proxy may run where Node's
 * is not available.
 */

export const PERSON_COOKIE = "wd_person";
export const PERSON_HEADER = "x-walkdots-person";
/**
 * The browser, always — signed in or not. The person header names the account
 * when there is one, which hides the device; the paywall needs both, so that
 * the free walk taken signed out is still "used" after signing in, and the
 * other way round (lib/billing/store.ts).
 */
export const DEVICE_HEADER = "x-walkdots-device";

function secret(): string {
  return process.env.RATE_LIMIT_SALT ?? process.env.CLERK_SECRET_KEY ?? process.env.DATABASE_URL ?? "walkdots";
}

export async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `u:<account>` or `d:<browser id>`, with its signature. */
export async function signPerson(id: string): Promise<string> {
  return `${id}.${await hmac(id)}`;
}

/** The person in a signed header, or null when it is missing or forged. */
export async function verifyPerson(header: string | null): Promise<string | null> {
  if (!header) return null;
  const dot = header.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = header.slice(0, dot);
  return (await hmac(id)) === header.slice(dot + 1) ? id : null;
}

/** A browser ID worth keeping: one we made, not whatever was in the cookie. */
export function validDeviceId(v: string | undefined): v is string {
  return !!v && /^[0-9a-f-]{36}$/.test(v);
}
