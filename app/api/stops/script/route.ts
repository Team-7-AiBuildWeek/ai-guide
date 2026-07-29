/**
 * The narration for one stop, written on demand.
 *
 * Split out from /api/tours so a long walk appears on the map in half a minute
 * instead of twenty. The client asks for the stop it is on and the one after
 * it; everything further ahead is written later, or never, if the walker gives
 * up at stop four.
 *
 * The cache and the de-duplication live in lib/tour/scriptCache so /api/tours
 * can share them — see the note there.
 */

import { cachedScript, writeStopScript, type ScriptJob } from "@/lib/tour/scriptCache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: ScriptJob;
  try {
    body = (await request.json()) as ScriptJob;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body?.stop?.id || !body?.req) {
    return Response.json({ error: "A stop and the tour request are required." }, { status: 400 });
  }

  const hit = cachedScript(body);
  if (hit) return Response.json({ ...hit, cached: true });

  try {
    return Response.json(await writeStopScript(body));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not write this stop." },
      { status: 502 },
    );
  }
}
