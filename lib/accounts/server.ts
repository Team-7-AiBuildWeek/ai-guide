/**
 * Who is asking, for the /api/me routes: the Clerk user, or the response to
 * send back instead (accounts not set up, or not signed in).
 */

import { auth } from "@clerk/nextjs/server";
import { accountsConfigured } from "./store";

export async function signedInUser(): Promise<string | Response> {
  if (!accountsConfigured()) return Response.json({ error: "Accounts are not set up." }, { status: 503 });
  const { userId } = await auth();
  return userId ?? Response.json({ error: "Sign in first." }, { status: 401 });
}
