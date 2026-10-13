/** POST { code }: a new account says who invited them (lib/billing/loyalty.ts). */

import { clerkClient } from "@clerk/nextjs/server";
import { signedInUser } from "@/lib/accounts/server";
import { claimReferral, loyaltyEnabled } from "@/lib/billing/loyalty";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!loyaltyEnabled()) return Response.json({ claimed: false });
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  if (!code || code.length > 16) return Response.json({ error: "Missing code." }, { status: 400 });
  const user = await (await clerkClient()).users.getUser(userId);
  return Response.json({ claimed: await claimReferral(userId, code, user.createdAt) });
}
