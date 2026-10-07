/**
 * DELETE: forget everything kept for this account, then the account itself.
 *
 * Apple requires an app with accounts to let them be deleted from inside it,
 * and the privacy policy promises the same on the website. The walks go first,
 * so a failure part-way leaves an account with nothing in it rather than walks
 * nobody can reach.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { signedInUser } from "@/lib/accounts/server";
import { forgetUser } from "@/lib/accounts/store";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  await forgetUser(userId);
  await (await clerkClient()).users.deleteUser(userId);
  return new Response(null, { status: 204 });
}
