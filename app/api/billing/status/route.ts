/**
 * What this person can build next — for the apps to gate "Build my tour"
 * before the wait, rather than after it.
 *
 * Works signed out (the free walk is per browser too). `enabled` says whether
 * the paywall applies to this person at all; the apps hide everything about
 * plans and walks left while it does not.
 */

import { treatmentFor } from "@/lib/billing/mode";
import { refundStaleWalks, walkStatus, whoIs } from "@/lib/billing/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const who = await whoIs(request.headers);
  const treatment = who ? await treatmentFor(who.userId) : "off";
  if (!who || treatment === "off" || treatment === "shadow") {
    return Response.json({ enabled: false, signedIn: !!who?.userId, canWalk: true });
  }
  try {
    // A build killed mid-way never got to give its walk back; this is the
    // moment the walker would notice, so settle it first.
    if (who.userId) await refundStaleWalks(who.userId);
    const status = await walkStatus(who);
    return Response.json({
      enabled: true,
      signedIn: !!who.userId,
      ...status,
      // A developer under PAYWALL_MODE=on is never stopped.
      canWalk: treatment === "free" ? true : status.canWalk,
    });
  } catch (err) {
    console.error("[paywall] status failed:", err);
    // Unknown is not "no": the build itself enforces, so let the app try.
    return Response.json({ enabled: true, signedIn: !!who.userId, canWalk: true, unknown: true });
  }
}
