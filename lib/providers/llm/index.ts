import type { AskRequest, TourPlan, TourRequest } from "@/lib/providers/types";
import { TourPlanSchema, ProviderError } from "@/lib/providers/types";
import { buildTourPlanPrompt, lengthFloors, SYSTEM_PROMPT } from "@/lib/prompts/tour-plan";
import { ASK_SYSTEM_PROMPT, buildAskPrompt } from "@/lib/prompts/ask";

export interface LLMProvider {
  readonly name: string;
  generateTourPlan(input: TourRequest): Promise<TourPlan>;
  /** A question from the street, answered against the walker's own brief. */
  answerQuestion(input: AskRequest): Promise<string>;
}

/**
 * What every real provider has to supply: turn a system + user prompt into a
 * string that ought to be JSON. Everything else — prompt assembly, validation,
 * the retry — is shared below so three vendors can't drift apart.
 */
export type CompleteFn = (args: {
  system: string;
  user: string;
  maxTokens: number;
}) => Promise<string>;

/** Models like to wrap JSON in a ```json fence no matter how firmly you ask. */
function stripFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  // Or to chatter before the object. Take the outermost braces.
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Which stops came back too short.
 *
 * Asking for length is not enough — models routinely return half of what was
 * requested. Measuring it and handing the shortfall back, stop by stop, is
 * what actually gets a three-minute script instead of a ninety-second one.
 */
function shortfalls(plan: TourPlan, detail: TourRequest["detail"]): string[] {
  const floor = lengthFloors(detail);
  const out: string[] = [];
  for (const stop of plan.stops) {
    const s = words(stop.scriptShort);
    const f = words(stop.scriptFull);
    if (f < floor.full) out.push(`"${stop.name}" scriptFull is ${f} words, needs at least ${floor.full}`);
    else if (s < floor.short) out.push(`"${stop.name}" scriptShort is ${s} words, needs at least ${floor.short}`);
  }
  return out;
}

/**
 * Parse and validate, retrying once with the error fed back to the model.
 * One retry only: if it can't produce the shape twice, a third go won't help
 * and the walker is standing on a street corner waiting.
 */
export async function generateTourPlanVia(
  providerName: string,
  complete: CompleteFn,
  req: TourRequest,
): Promise<TourPlan> {
  const user = buildTourPlanPrompt(req);

  const attempt = async (extra?: string): Promise<TourPlan> => {
    const raw = await complete({
      system: SYSTEM_PROMPT,
      user: extra ? `${user}\n\n${extra}` : user,
      // Generous: six stops of ~800 words each, plus cues and JSON overhead,
      // and on thinking models the reasoning counts against this too. Running
      // out shows up as a truncated plan, not an error.
      maxTokens: 48000,
    });
    const parsed = TourPlanSchema.safeParse(JSON.parse(stripFence(raw)));
    if (!parsed.success) {
      throw new SchemaError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    return parsed.data;
  };

  try {
    const plan = await attempt();
    const short = shortfalls(plan, req.detail);
    if (short.length === 0) return plan;

    // One expansion pass. If it still comes back thin, the walker gets the
    // shorter tour rather than an error — a real tour beats a failed one.
    try {
      return await attempt(
        `Your previous answer was too short. Specifically: ${short.join("; ")}. ` +
          `Return the SAME stops, in the same order, with the same coordinates — ` +
          `only rewrite the scripts that fall short, at the required length. ` +
          `Do not pad: add substance, detail and story until each one genuinely covers its stop.`,
      );
    } catch {
      return plan;
    }
  } catch (err) {
    const detail =
      err instanceof SchemaError
        ? err.issues.join("; ")
        : err instanceof SyntaxError
          ? `the response was not valid JSON (${err.message})`
          : null;
    if (detail === null) throw err; // network / auth — retrying won't fix it

    try {
      return await attempt(
        `Your previous answer was rejected: ${detail}. ` +
          `Return the corrected JSON object only, matching the schema exactly.`,
      );
    } catch (retryErr) {
      throw new ProviderError(
        providerName,
        `could not produce a valid tour plan after one retry`,
        retryErr,
      );
    }
  }
}

class SchemaError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "SchemaError";
  }
}

/**
 * Ask a question, shared by every real provider so they answer identically.
 *
 * Deliberately not JSON: the answer is spoken aloud, so it is plain text and
 * any wrapper the model adds is stripped rather than parsed.
 */
export async function answerQuestionVia(
  providerName: string,
  complete: CompleteFn,
  req: AskRequest,
): Promise<string> {
  const raw = await complete({
    system: ASK_SYSTEM_PROMPT,
    user: buildAskPrompt(req),
    maxTokens: 2000,
  });
  const answer = raw.trim().replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
  if (!answer) throw new ProviderError(providerName, "the model returned an empty answer");
  return answer;
}
