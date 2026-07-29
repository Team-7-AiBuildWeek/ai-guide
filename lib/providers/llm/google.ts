/**
 * Gemini tour planning, via @google/genai.
 *
 * Server-side only — the key comes from `lib/config.ts` and is passed in
 * explicitly rather than read from the environment by the SDK.
 *
 * Validation and the single retry are not here: they live in
 * `generateTourPlanVia`, shared with the other vendors, so all three behave
 * identically when a model returns something that isn't the schema.
 */

import { GoogleGenAI } from "@google/genai";
import { config, requireKey } from "@/lib/config";
import { ProviderError, type AskRequest, type TourPlan, type TourRequest } from "@/lib/providers/types";
import { TOUR_PLAN_JSON_SCHEMA } from "@/lib/prompts/tour-plan";
import { answerQuestionVia, generateTourPlanVia, type CompleteFn, type LLMProvider } from "./index";

export class GoogleLLMProvider implements LLMProvider {
  readonly name = "google";

  /** One call shape, used for both tours and questions. */
  private complete(json: boolean): CompleteFn {
    const apiKey = requireKey(config.geminiApiKey, "GEMINI_API_KEY", "google");
    const ai = new GoogleGenAI({ apiKey });

    /**
     * 503 UNAVAILABLE means the model is busy, not that the request was wrong.
     * It arrives in seconds and clears in seconds, so it is worth waiting out
     * — the alternative is telling a walker their tour failed when it didn't.
     */
    const isTransient = (e: unknown) => /\b(503|429)\b|UNAVAILABLE|high demand|overloaded/i.test(String(e));

    return async ({ system, user, maxTokens }) => {
      const call = () =>
        ai.models.generateContent({
          model: config.geminiModel,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            maxOutputTokens: maxTokens,
            ...(json
              ? {
                  // Constrained decoding: the model can only emit our shape.
                  // Zod still checks it — a schema hint is not a guarantee.
                  responseMimeType: "application/json",
                  responseSchema: TOUR_PLAN_JSON_SCHEMA as never,
                }
              : {}),
          },
        });

      let res;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await call();
          break;
        } catch (err) {
          lastErr = err;
          if (!isTransient(err)) {
            throw new ProviderError(this.name, err instanceof Error ? err.message : String(err), err);
          }
          if (attempt === 2) break;
          await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        }
      }
      if (!res) {
        throw new ProviderError(
          this.name,
          "Gemini is busy right now — it usually clears within a minute.",
          lastErr,
        );
      }

      const text = res.text;
      if (!text) {
        const reason = res.candidates?.[0]?.finishReason ?? "no finishReason";
        // MAX_TOKENS here means the scripts outgrew the budget, not that the
        // request was bad — worth saying so rather than "empty response".
        throw new ProviderError(this.name, `no text returned (${reason})`);
      }
      return text;
    };
  }

  async generateTourPlan(input: TourRequest): Promise<TourPlan> {
    return generateTourPlanVia(this.name, this.complete(true), input);
  }

  async answerQuestion(input: AskRequest): Promise<string> {
    return answerQuestionVia(this.name, this.complete(false), input);
  }
}
