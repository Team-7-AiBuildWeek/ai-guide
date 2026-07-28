/**
 * "Ask anything" — a question about what the walker is looking at.
 *
 * Reuses the LLM provider so it swaps with one env var like everything else.
 * The answer is short on purpose: it is read on a phone, outdoors, mid-walk.
 */

import { getLLM } from "@/lib/providers/factory";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AskBody = {
  question: string;
  stopName?: string;
  lat?: number;
  lng?: number;
  lang?: string;
};

export async function POST(request: Request) {
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.question?.trim()) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }

  // The mock LLM only knows how to plan tours, so answer honestly rather than
  // inventing something — the whole app is meant to run keyless.
  if (config.llmProvider === "mock") {
    return Response.json({
      answer:
        `You asked: "${body.question.trim()}"` +
        (body.stopName ? ` at ${body.stopName}.` : ".") +
        " Questions need a real language model — set LLM_PROVIDER and its key to switch it on.",
      mocked: true,
    });
  }

  try {
    // generateTourPlan is the only method on the interface, so the question is
    // framed as a one-stop tour and the answer read out of the summary.
    const plan = await getLLM().generateTourPlan({
      freeText:
        `The walker is standing at ${body.stopName ?? "a stop on the tour"} and asks: ` +
        `"${body.question.trim()}". Answer it in the summary field, in under 90 spoken words. ` +
        `Use one stop only.`,
      durationMinutes: 30,
      detail: "highlights",
      pace: "steady",
      interests: ["history"],
      start: { lat: body.lat ?? 48.1435, lng: body.lng ?? 17.1073 },
      lang: body.lang ?? "en",
    });
    return Response.json({ answer: plan.summary, mocked: false });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not answer." },
      { status: 502 },
    );
  }
}
