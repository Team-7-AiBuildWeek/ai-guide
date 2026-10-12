/**
 * Clerk, only where an account matters: the /api/me routes, the
 * developer-only voice bench — and the routes that spend AI credits, where the
 * account decides whose allowance a call comes out of (lib/person.ts).
 *
 * The map, the pages and everything else never wait on a session check.
 * Without Clerk's keys (a local checkout, a preview without them) the proxy
 * steps aside for accounts, and the paid routes count by browser alone.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { PERSON_COOKIE, PERSON_HEADER, signPerson, validDeviceId } from "@/lib/person";

/** The routes that call the model or the voice, and so are rate-limited. Keep in step with `matcher`. */
const PAID = ["/api/ask", "/api/tours", "/api/stops/script", "/api/audio"];

const isPaid = (path: string) => PAID.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Passes the request on with the person it is from, signed. Any header of
 * that name the client sent is dropped first — it is only ever ours.
 */
async function withPerson(request: NextRequest, userId: string | null): Promise<NextResponse> {
  const headers = new Headers(request.headers);
  headers.delete(PERSON_HEADER);
  const cookie = request.cookies.get(PERSON_COOKIE)?.value;
  const device = validDeviceId(cookie) ? cookie : crypto.randomUUID();
  headers.set(PERSON_HEADER, await signPerson(userId ? `u:${userId}` : `d:${device}`));
  const res = NextResponse.next({ request: { headers } });
  if (device !== cookie) {
    // Only the paid routes ever read it, so it is only sent to /api.
    res.cookies.set(PERSON_COOKIE, device, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

const withClerk =
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? clerkMiddleware(async (auth, request) => {
        if (!isPaid(request.nextUrl.pathname)) return undefined;
        const { userId } = await auth();
        return withPerson(request, userId);
      })
    : null;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (withClerk) return withClerk(request, event);
  return isPaid(request.nextUrl.pathname) ? withPerson(request, null) : NextResponse.next();
}

export const config = {
  // /api/dev/tts too: it is developer-only, and Clerk's session has to be read
  // to know who is asking.
  matcher: ["/api/me", "/api/me/(.*)", "/api/dev/tts", "/api/ask", "/api/tours", "/api/stops/script", "/api/audio"],
};
