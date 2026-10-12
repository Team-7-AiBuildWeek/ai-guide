/**
 * Who counts as a developer: the accounts whose email is in DEVELOPER_EMAILS
 * (comma-separated, set in Vercel). They see the developer tools — the demo
 * tour, the developer panel, the saved tours, the phone view — and nobody else
 * does. The list lives on the server only; the apps just ask.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { signedInUser } from "./server";

function developerEmails(): string[] {
  return (process.env.DEVELOPER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isDeveloper(userId: string): Promise<boolean> {
  const allowed = developerEmails();
  if (allowed.length === 0) return false;
  const user = await (await clerkClient()).users.getUser(userId);
  return user.emailAddresses.some((e) => allowed.includes(e.emailAddress.toLowerCase()));
}

/** The developer's user id, or the response to send instead (not signed in, or not a developer). */
export async function developerOnly(): Promise<string | Response> {
  const userId = await signedInUser();
  if (userId instanceof Response) return userId;
  return (await isDeveloper(userId)) ? userId : Response.json({ error: "Developers only." }, { status: 403 });
}
