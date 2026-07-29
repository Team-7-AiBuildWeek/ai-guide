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
import { ProviderError, type TourPlan, type TourRequest } from "@/lib/providers/types";
import { TOUR_PLAN_JSON_SCHEMA } from "@/lib/prompts/tour-plan";
import { generateTourPlanVia, type LLMProvider } from "./index";

export class GoogleLLMProvider implements LLMProvider {
  readonly name = "google";

  async generateTourPlan(input: TourRequest): Promise<TourPlan> {
    const apiKey = requireKey(config.geminiApiKey, "GEMINI_API_KEY", "google");
    const ai = new GoogleGenAI({ apiKey });

    return generateTourPlanVia(this.name, async ({ system, user, maxTokens }) => {
      let res;
      try {
        res = await ai.models.generateContent({
          model: config.geminiModel,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            maxOutputTokens: maxTokens,
            // Constrained decoding: the model can only emit our shape. Zod
            // still checks it — a schema hint is not a guarantee.
            responseMimeType: "application/json",
            responseSchema: TOUR_PLAN_JSON_SCHEMA as never,
          },
        });
      } catch (err) {
        throw new ProviderError(this.name, err instanceof Error ? err.message : String(err), err);
      }

      const text = res.text;
      if (!text) {
        const reason = res.candidates?.[0]?.finishReason ?? "no finishReason";
        // MAX_TOKENS here means the scripts outgrew the budget, not that the
        // request was bad — worth saying so rather than "empty response".
        throw new ProviderError(this.name, `no text returned (${reason})`);
      }
      return text;
    }, input);
  }
}
