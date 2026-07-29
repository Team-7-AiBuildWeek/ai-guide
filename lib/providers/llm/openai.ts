/** OpenAI chat completions, over plain fetch. See the note in anthropic.ts about SDKs. */

import { config, requireKey } from "@/lib/config";
import { ProviderError, type AskRequest, type TourPlan, type TourRequest } from "@/lib/providers/types";
import { TOUR_PLAN_JSON_SCHEMA } from "@/lib/prompts/tour-plan";
import { answerQuestionVia, generateTourPlanVia, type CompleteFn, type LLMProvider } from "./index";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

type OpenAIResponse = {
  choices: Array<{ message: { content: string | null }; finish_reason: string }>;
};

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";

  private complete(json: boolean): CompleteFn {
    const apiKey = requireKey(config.openaiApiKey, "OPENAI_API_KEY", "openai");

    return async ({ system, user, maxTokens }) => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.openaiModel,
          max_completion_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...(json
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: { name: "tour_plan", strict: true, schema: TOUR_PLAN_JSON_SCHEMA },
                },
              }
            : {}),
        }),
      });

      if (!res.ok) {
        throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
      }

      const body = (await res.json()) as OpenAIResponse;
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError(this.name, "empty response");
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
