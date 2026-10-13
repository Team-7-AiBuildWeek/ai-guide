/**
 * How far the paywall is switched on, from PAYWALL_MODE (server only, so the
 * website and the phone both follow it without a release):
 *
 *  - off         nothing is recorded, nobody is stopped (the default);
 *  - shadow      every walk is recorded with what it *would* have cost, and
 *                nobody is stopped — for checking the books before charging;
 *  - developers  developer accounts (DEVELOPER_EMAILS) see the plans and walk
 *                free, and everyone else is shadow — nobody is ever stopped;
 *  - on          the paywall is real for everyone; developers walk free.
 *
 * Server-only.
 */

import { isDeveloper } from "@/lib/accounts/developer";

export type PaywallMode = "off" | "shadow" | "developers" | "on";

export function paywallMode(): PaywallMode {
  const m = (process.env.PAYWALL_MODE ?? "off").trim().toLowerCase();
  return m === "shadow" || m === "developers" || m === "on" ? m : "off";
}

/**
 * isDeveloper asks Clerk on every call; a paywall check on every build would
 * make that a Clerk request per walk. Ten minutes is long enough to matter and
 * short enough that adding someone to the list takes effect the same morning.
 */
const DEV_TTL_MS = 10 * 60_000;
const devCache = new Map<string, { value: boolean; at: number }>();

export async function developer(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const hit = devCache.get(userId);
  if (hit && Date.now() - hit.at < DEV_TTL_MS) return hit.value;
  const value = await isDeveloper(userId).catch(() => false);
  devCache.set(userId, { value, at: Date.now() });
  return value;
}

/**
 * What the paywall does for this person:
 *  - "enforce"  their walks are counted and they can be stopped;
 *  - "free"     a developer (under `developers` or `on`): counted as a developer walk, never stopped;
 *  - "shadow"   counted for the books only;
 *  - "off"      not counted at all.
 */
export async function treatmentFor(userId: string | null): Promise<"enforce" | "free" | "shadow" | "off"> {
  const mode = paywallMode();
  if (mode === "off") return "off";
  if (mode === "shadow") return "shadow";
  const dev = await developer(userId);
  if (mode === "developers") return dev ? "free" : "shadow";
  return dev ? "free" : "enforce";
}
