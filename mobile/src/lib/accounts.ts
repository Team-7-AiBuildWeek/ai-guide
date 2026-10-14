/**
 * Accounts on the phone — the website's lib/accounts/client.ts.
 *
 * Whether accounts exist in this build: they need Clerk's publishable key
 * (app.json → extra.clerkPublishableKey). Without it the app is exactly what
 * it was — every walk on the phone, nothing to sign in to.
 *
 * Signed in, walks are kept in step with the website through its /api/me
 * routes, signed with this phone's Clerk session.
 */

import { getClerkInstance } from "@clerk/expo";
import Constants from "expo-constants";
import { BASE } from "./api";
import { loadWalks, mergeWalks, type WalkRecord } from "./history";

export const CLERK_PUBLISHABLE_KEY =
  (Constants.expoConfig?.extra?.clerkPublishableKey as string | undefined) || null;

export const accountsEnabled = CLERK_PUBLISHABLE_KEY !== null;

/**
 * The signed-in account, for requests outside /api/me that still need to know
 * who is asking — building a tour, whose free walk and paid walks belong to the
 * account (the website's lib/billing). Empty when nobody is signed in.
 */
export async function authHeader(): Promise<Record<string, string>> {
  if (!accountsEnabled) return {};
  try {
    const token = await getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY! }).session?.getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** A request to /api/me, or null when nobody is signed in. */
async function me(path: string, init?: RequestInit): Promise<Response | null> {
  if (!accountsEnabled) return null;
  const token = await getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY! }).session?.getToken();
  if (!token) return null;
  return fetch(`${BASE}/api/me${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

/** Whether this account is a developer, and what the server runs on (see the website's lib/accounts/developer.ts). */
export async function developerStatus(): Promise<{
  developer: boolean;
  info: Record<string, string> | null;
  tts: string | null;
}> {
  try {
    const res = await me("/developer");
    if (!res?.ok) return { developer: false, info: null, tts: null };
    const body = (await res.json()) as { developer?: boolean; info?: Record<string, string>; tts?: string };
    return { developer: Boolean(body.developer), info: body.info ?? null, tts: body.tts ?? null };
  } catch {
    return { developer: false, info: null, tts: null };
  }
}

/** Sends this phone's walks, takes back the account's, keeps the union. */
export async function syncWalks(): Promise<WalkRecord[] | null> {
  try {
    const res = await me("/walks", { method: "POST", body: JSON.stringify({ walks: loadWalks() }) });
    if (!res?.ok) return null;
    const body = (await res.json()) as { walks?: WalkRecord[] };
    return mergeWalks(body.walks ?? []);
  } catch {
    return null; // offline: they sync next time
  }
}

/** A walk deleted on this phone goes from the account too, when there is one. */
export function forgetWalkEverywhere(at: number): void {
  void me(`/walks?at=${at}`, { method: "DELETE" }).catch(() => {});
}

/** Everything kept for the account, then the account itself. */
export async function deleteAccount(): Promise<boolean> {
  const res = await me("", { method: "DELETE" });
  return !!res?.ok;
}
