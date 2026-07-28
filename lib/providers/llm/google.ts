/** Google Gemini generateContent, over plain fetch. See the note in anthropic.ts about SDKs. */

import { config, requireKey } from "@/lib/config";
import { ProviderError, type TourPlan, type TourRequest } from "@/lib/providers/types";
import { TOUR_PLAN_JSON_SCHEMA } from "@/lib/prompts/tour-plan";
import { generateTourPlanVia, type LLMProvider } from "./index";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

export class GoogleLLMProvider implements LLMProvider {
  readonly name = "google";

  async generateTourPlan(input: TourRequest): Promise<TourPlan> {
    const apiKey = requireKey(config.googleApiKey, "GOOGLE_API_KEY", "google");
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(config.googleModel)}:generateContent`;

    return generateTourPlanVia(this.name, async ({ system, user, maxTokens }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
            responseSchema: TOUR_PLAN_JSON_SCHEMA,
          },
        }),
      });

      if (!res.ok) {
        throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
      }

      const body = (await res.json()) as GeminiResponse;
      if (body.promptFeedback?.blockReason) {
        throw new ProviderError(this.name, `blocked: ${body.promptFeedback.blockReason}`);
      }

      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (!text) throw new ProviderError(this.name, "empty response");
      return text;
    }, input);
  }
}
