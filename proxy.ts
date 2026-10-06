/**
 * Clerk, only where an account matters: the /api/me routes.
 *
 * Everything else — the map, building a tour, the narration — is the same for
 * everyone and never waits on a session check. Without Clerk's keys (a local
 * checkout, a preview without them) the proxy steps aside and those routes
 * answer that accounts are not set up.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const withClerk = process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? clerkMiddleware() : null;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return withClerk ? withClerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: ["/api/me", "/api/me/(.*)"],
};
