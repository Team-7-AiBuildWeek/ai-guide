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

  try {
    const answer = await getLLM().answerQuestion({
      question: body.question,
      lang: normaliseLang(body.lang),
      freeText: body.freeText,
      interests: body.interests ?? [],
      detail: body.detail ?? "story",
      tourTitle: body.tourTitle,
      stopName: body.stopName,
      stopContext: body.stopContext,
      lat: body.lat,
      lng: body.lng,
    });
    return Response.json({ answer });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not answer." },
      { status: 502 },
    );
  }
}
