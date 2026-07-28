import type { TourPlan, TourRequest } from "@/lib/providers/types";
import { TourPlanSchema, ProviderError } from "@/lib/providers/types";
import { buildTourPlanPrompt, SYSTEM_PROMPT } from "@/lib/prompts/tour-plan";

export interface LLMProvider {
  readonly name: string;
  generateTourPlan(input: TourRequest): Promise<TourPlan>;
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
      maxTokens: 16000,
    });
    const parsed = TourPlanSchema.safeParse(JSON.parse(stripFence(raw)));
    if (!parsed.success) {
      throw new SchemaError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    return parsed.data;
  };

  try {
    return await attempt();
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
