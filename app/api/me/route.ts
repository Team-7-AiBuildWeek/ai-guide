/**
 * DELETE: forget everything kept for this account, then the account itself.
 *
 * Apple requires an app with accounts to let them be deleted from inside it,
 * and the privacy policy promises the same on the website. Payments go first
 * (lib/billing/forget.ts): a plan that cannot be cancelled stops the deletion,
 * because a deleted account must never be charged again. Then the walks, so a
 * failure part-way leaves an account with nothing in it rather than walks
 * nobody can reach.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { signedInUser } from "@/lib/accounts/server";
import { forgetUser } from "@/lib/accounts/store";
import { forgetBilling } from "@/lib/billing/forget";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  try {
    await forgetBilling(userId);
  } catch (err) {
    console.error("[account] could not cancel billing before deleting:", err);
    return Response.json(
      { error: "We couldn't cancel your plan just now, so your account wasn't deleted. Please try again in a minute." },
      { status: 502 },
    );
  }
  await forgetUser(userId);
  await (await clerkClient()).users.deleteUser(userId);
  return new Response(null, { status: 204 });
}
