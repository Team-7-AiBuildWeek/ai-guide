/** GET: every saved tour, newest first, for the developers' list (/dev/tours). */

import { developerOnly } from "@/lib/accounts/developer";
import { listSavedTours } from "@/lib/tour/saved";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const who = await developerOnly();
  if (who instanceof Response) return who;
  const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 200));
  try {
    return Response.json({ tours: await listSavedTours(limit) });
  } catch {
    return Response.json({ error: "The saved tours could not be reached." }, { status: 503 });
  }
}
