/**
 * A recorded stop from walk-backend, by its stable id.
 *
 * Stops carry this URL rather than the storage link, because storage links are
 * signed and expire within a day while a walk is saved for weeks. Each request
 * gets a freshly signed link and is redirected to it, so the audio itself comes
 * straight from storage (R2 in production) and never through this server.
 */

import { BackendError, backendSegment } from "@/lib/backend/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const segment = await backendSegment(id);
    return new Response(null, {
      status: 302,
      headers: { location: segment.url, "cache-control": "no-store" },
    });
  } catch (err) {
    const status = err instanceof BackendError && err.status === 404 ? 404 : 502;
    return Response.json(
      { error: status === 404 ? "No such recording." : "The recording could not be reached." },
      { status },
    );
  }
}
