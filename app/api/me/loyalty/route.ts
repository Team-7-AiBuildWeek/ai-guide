/** GET: this account's points, tier and city stamps (lib/billing/loyalty.ts). */

import { signedInUser } from "@/lib/accounts/server";
import { loyaltyEnabled, loyaltyFor } from "@/lib/billing/loyalty";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!loyaltyEnabled()) return Response.json({ enabled: false });
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  return Response.json({ enabled: true, ...(await loyaltyFor(userId)) });
}
