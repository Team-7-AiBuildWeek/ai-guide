/**
 * A signature on a walk's stops, issued when the walk is built.
 *
 * "Walk it again" sends the stops back and skips choosing them — and skips
 * paying for them, which is right for a walk the person was given, and wrong
 * for one they typed in: posting a made-up list of stops would otherwise be a
 * free walk with all its narration. The server signs each plan it hands out;
 * a replay is accepted with a matching signature (enforced once the paywall is
 * on — see app/api/tours/route.ts).
 *
 * Over the stops' ids and positions only, to four decimals (~10 m): that is
 * what a replay keeps, and a rounding difference must not break it.
 *
 * Server-only.
 */

import { hmac } from "@/lib/person";
import type { Stop } from "@/lib/providers/types";

function canonical(stops: Pick<Stop, "id" | "lat" | "lng">[]): string {
  return stops.map((s) => `${s.id}|${s.lat.toFixed(4)}|${s.lng.toFixed(4)}`).join(";");
}

export async function signPlan(stops: Pick<Stop, "id" | "lat" | "lng">[]): Promise<string> {
  return hmac(`plan|${canonical(stops)}`);
}

export async function planSigValid(stops: Pick<Stop, "id" | "lat" | "lng">[], sig: string | undefined): Promise<boolean> {
  return !!sig && (await signPlan(stops)) === sig;
}
