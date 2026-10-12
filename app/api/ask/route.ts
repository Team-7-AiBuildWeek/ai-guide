/**
 * "Ask anything" — a question from the street.
 *
 * The answer is built against the brief the walker gave on the setup screen,
 * not in a vacuum. Without that this is just a search box that happens to know
 * a place name.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getLLM } from "@/lib/providers/factory";
import type { AskRequest } from "@/lib/providers/types";
import { surroundings } from "@/lib/tour/surroundings";
import { RateLimited, rateLimitedResponse, spend } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: Partial<AskRequest>;
  try {
    body = (await request.json()) as Partial<AskRequest>;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.question?.trim()) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }
  // A question from the street is a sentence or two; the stop's script and the
  // brief are a few thousand characters. Far more is not a walker asking.
  if (body.question.length > 1000 || (body.stopContext?.length ?? 0) > 20_000 || (body.freeText?.length ?? 0) > 4000) {
    return Response.json({ error: "That is too long to ask." }, { status: 413 });
  }

  // Every question is a paid call: counted before anything else is spent on it.
  try {
    await spend(request.headers, "ask");
  } catch (err) {
    if (err instanceof RateLimited) return rateLimitedResponse(err);
    throw err;
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const lat = num(body.lat);
  const lng = num(body.lng);
  const lang = normaliseLang(body.lang);

  /**
   * What is actually around the walker, from the map. Only with a real fix:
   * the stop's own position would describe the stop, which the guide already
   * knows, and would put the walker somewhere they may not be.
   */
  const around =
    lat !== undefined && lng !== undefined
      ? await surroundings({ lat, lng, accuracy: num(body.accuracy), heading: num(body.heading) ?? null, lang }).catch(
          () => null,
        )
      : null;

  try {
    const answer = await getLLM().answerQuestion({
      question: body.question,
      lang,
      freeText: body.freeText,
      interests: body.interests ?? [],
      detail: body.detail ?? "story",
      city: body.city,
      tourTitle: body.tourTitle,
      stopName: body.stopName,
      stopContext: body.stopContext,
      lat,
      lng,
      accuracy: num(body.accuracy),
      heading: num(body.heading) ?? null,
      stopLat: num(body.stopLat),
      stopLng: num(body.stopLng),
      surroundings: around?.lines,
    });
    return Response.json({ answer });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not answer." },
      { status: 502 },
    );
  }
}
