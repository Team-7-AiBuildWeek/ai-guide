/**
 * DELETE: forget everything kept for this account, then the account itself.
 *
 * Apple requires an app with accounts to let them be deleted from inside it,
 * and the privacy policy promises the same on the website. The walks go first,
 * so a failure part-way leaves an account with nothing in it rather than walks
 * nobody can reach.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { accountsConfigured, forgetUser } from "@/lib/accounts/store";

export const dynamic = "force-dynamic";

export async function DELETE() {
  if (!accountsConfigured()) return Response.json({ error: "Accounts are not set up." }, { status: 503 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  await forgetUser(userId);
  await (await clerkClient()).users.deleteUser(userId);
  return new Response(null, { status: 204 });
}
