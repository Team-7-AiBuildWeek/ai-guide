/** POST { key }: spend 500 points on one walk. The key makes a retried tap spend once. */

import { signedInUser } from "@/lib/accounts/server";
import { loyaltyEnabled, redeem } from "@/lib/billing/loyalty";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!loyaltyEnabled()) return Response.json({ error: "Points aren't on yet." }, { status: 404 });
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  const { key } = (await request.json().catch(() => ({}))) as { key?: string };
  if (!key || key.length > 64) return Response.json({ error: "Missing key." }, { status: 400 });
  const result = await redeem(userId, key);
  return result.ok
    ? Response.json(result)
    : Response.json({ error: "Not enough points yet." }, { status: 409 });
}
