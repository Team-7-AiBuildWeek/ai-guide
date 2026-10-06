/**
 * The signed-in walker's walks, for the website and the phone alike.
 *
 *   GET     the kept walks, newest first
 *   POST    { walks } — adds any this account has not seen; answers with all of them
 *   DELETE  ?at=… — forgets one
 *
 * The phone signs requests with its Clerk session token (Authorization:
 * Bearer); the website with its session cookie. Either way Clerk says who.
 */

import { auth } from "@clerk/nextjs/server";
import { accountsConfigured, addWalks, forgetWalk, listWalks, type StoredWalk } from "@/lib/accounts/store";

export const dynamic = "force-dynamic";

async function who(): Promise<string | Response> {
  if (!accountsConfigured()) return Response.json({ error: "Accounts are not set up." }, { status: 503 });
  const { userId } = await auth();
  return userId ?? Response.json({ error: "Sign in first." }, { status: 401 });
}

export async function GET() {
  const user = await who();
  if (user instanceof Response) return user;
  return Response.json({ walks: await listWalks(user) });
}

export async function POST(request: Request) {
  const user = await who();
  if (user instanceof Response) return user;
  let body: { walks?: StoredWalk[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.walks)) return Response.json({ error: "Send { walks: [...] }." }, { status: 400 });
  return Response.json({ walks: await addWalks(user, body.walks) });
}

export async function DELETE(request: Request) {
  const user = await who();
  if (user instanceof Response) return user;
  const at = Number(new URL(request.url).searchParams.get("at"));
  if (!Number.isFinite(at)) return Response.json({ error: "Say which walk: ?at=…" }, { status: 400 });
  await forgetWalk(user, at);
  return new Response(null, { status: 204 });
}
