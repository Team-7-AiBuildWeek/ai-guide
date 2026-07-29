import type { AskRequest, Stop, StopScript, TourPlan, TourRequest } from "@/lib/providers/types";
import { StopScriptSchema, TourPlanSchema, ProviderError } from "@/lib/providers/types";
import {
  ITINERARY_SYSTEM_PROMPT,
  SCRIPT_SYSTEM_PROMPT,
  buildItineraryPrompt,
  buildScriptPrompt,
  scriptFloor,
  stopCount,
} from "@/lib/prompts/tour-plan";
import { ASK_SYSTEM_PROMPT, buildAskPrompt } from "@/lib/prompts/ask";

/** What the script pass needs to know beyond the stop itself. */
export type ScriptRequest = {
  req: TourRequest;
  stop: Stop;
  previous: Stop | null;
  position: number;
  total: number;
};

export interface LLMProvider {
  readonly name: string;
  /** Pass one: which places, in what order. No narration. */
  generateTourPlan(input: TourRequest): Promise<TourPlan>;
  /** Pass two: the narration for a single stop, written while walking. */
  generateStopScript(input: ScriptRequest): Promise<StopScript>;
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

class SchemaError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "SchemaError";
  }
}

/** Why a response was unusable, when that is something a retry could fix. */
function retryableReason(err: unknown): string | null {
  if (err instanceof SchemaError) return err.issues.join("; ");
  if (err instanceof SyntaxError) return `the response was not valid JSON (${err.message})`;
  return null;
}

// --------------------------------------------------------------- itinerary --

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
  const user = buildItineraryPrompt(req);
  const wanted = stopCount(req);

  const attempt = async (extra?: string): Promise<TourPlan> => {
    const raw = await complete({
      system: ITINERARY_SYSTEM_PROMPT,
      user: extra ? `${user}\n\n${extra}` : user,
      // No narration in this pass, so a stop is a few dozen tokens even at
      // twenty-six of them. The headroom is for thinking models, whose
      // reasoning counts against the same budget.
      maxTokens: 16000,
    });
    const parsed = TourPlanSchema.safeParse(JSON.parse(stripFence(raw)));
    if (!parsed.success) {
      throw new SchemaError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    return parsed.data;
  };

  try {
    const plan = await attempt();
    // Short by a stop or two is a judgement call about the city. Short by half
    // is the model ignoring the number, which is the thing being fixed here.
    if (plan.stops.length >= Math.ceil(wanted * 0.75)) return plan;

    try {
      return await attempt(
        `Your previous answer had only ${plan.stops.length} stops. The walk asked for ` +
          `${req.durationMinutes} minutes, which is ${wanted} stops. Return the SAME good ` +
          `stops and add the missing ones, spreading them across the city rather than ` +
          `crowding the centre. ${wanted} stops.`,
      );
    } catch {
      return plan; // a short tour beats no tour
    }
  } catch (err) {
    const reason = retryableReason(err);
    if (reason === null) throw err; // network / auth — retrying won't fix it

    try {
      return await attempt(
        `Your previous answer was rejected: ${reason}. ` +
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

// ------------------------------------------------------------- one script --

/**
 * The narration for a single stop.
 *
 * Same retry shape as the itinerary, plus one length pass — models write half
 * of what is asked for, reliably enough that measuring it is the only way to
 * get five minutes instead of two.
 */
export async function generateStopScriptVia(
  providerName: string,
  complete: CompleteFn,
  input: ScriptRequest,
): Promise<StopScript> {
  const user = buildScriptPrompt(input);
  const floor = scriptFloor(input.req.detail);

  const attempt = async (extra?: string): Promise<StopScript> => {
    const raw = await complete({
      system: SCRIPT_SYSTEM_PROMPT,
      user: extra ? `${user}\n\n${extra}` : user,
      maxTokens: 8000,
    });
    const parsed = StopScriptSchema.safeParse(JSON.parse(stripFence(raw)));
    if (!parsed.success) {
      throw new SchemaError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    return parsed.data;
  };

  try {
    const first = await attempt();
    const got = words(first.script);
    if (got >= floor) return first;

    try {
      const longer = await attempt(
        `Your previous script was ${got} words, and this stop needs at least ${floor}. ` +
          `Write it again at the proper length. Do not pad: add substance — what happened ` +
          `here, who was involved, what to look at and why it is the way it is.`,
      );
      // If the second go is somehow worse, keep the better of the two.
      return words(longer.script) > got ? longer : first;
    } catch {
      return first;
    }
  } catch (err) {
    const reason = retryableReason(err);
    if (reason === null) throw err;
    try {
      return await attempt(
        `Your previous answer was rejected: ${reason}. Return the corrected JSON only.`,
      );
    } catch (retryErr) {
      throw new ProviderError(
        providerName,
        `could not write the narration for "${input.stop.name}"`,
        retryErr,
      );
    }
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
