/**
 * POST { walkId, visits }: a walk was finished on foot. Checked against what
 * the server kept when the walk was built, then awarded once
 * (lib/billing/loyalty.ts). A walk that does not qualify answers 200 with
 * nothing awarded — it is not an error the walker needs to see.
 */

import { signedInUser } from "@/lib/accounts/server";
import { developer } from "@/lib/billing/mode";
import { completeWalk, loyaltyEnabled, type Visit } from "@/lib/billing/loyalty";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!loyaltyEnabled()) return Response.json({ awarded: 0, enabled: false });
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  const body = (await request.json().catch(() => ({}))) as { walkId?: string; visits?: Visit[]; simulated?: boolean };
  if (!body.walkId || !Array.isArray(body.visits) || body.visits.length > 200) {
    return Response.json({ error: "Missing walk." }, { status: 400 });
  }
  // A simulated walk, or a developer's, is testing — not walking.
  if (body.simulated || (await developer(userId))) return Response.json({ awarded: 0, reason: "testing" });
  const visits = body.visits.filter(
    (v) => [v?.i, v?.t, v?.lat, v?.lng, v?.acc].every((n) => typeof n === "number" && Number.isFinite(n)),
  );
  return Response.json(await completeWalk(userId, body.walkId, visits));
}
