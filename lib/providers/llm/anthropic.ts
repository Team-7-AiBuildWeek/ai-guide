/**
 * Anthropic Messages API, over plain fetch.
 *
 * Deliberately no SDK: the whole point of this layer is that swapping vendors
 * costs one env var, and three vendor SDKs is three dependencies plus three
 * upgrade schedules. If we settle on Anthropic, @anthropic-ai/sdk is the
 * better long-term call — it handles retries and typed errors for us.
 */

import { config, requireKey } from "@/lib/config";
import { ProviderError, type AskRequest, type TourPlan, type TourRequest } from "@/lib/providers/types";
import { TOUR_PLAN_JSON_SCHEMA } from "@/lib/prompts/tour-plan";
import { answerQuestionVia, generateTourPlanVia, type CompleteFn, type LLMProvider } from "./index";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string } | null;
};

export class AnthropicLLMProvider implements LLMProvider {
  readonly name = "anthropic";

  private complete(json: boolean): CompleteFn {
    const apiKey = requireKey(config.anthropicApiKey, "ANTHROPIC_API_KEY", "anthropic");

    return async ({ system, user, maxTokens }) => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: config.anthropicModel,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          ...(json
            ? {
                // Constrained decoding — the model can only emit our schema.
                output_config: { format: { type: "json_schema", schema: TOUR_PLAN_JSON_SCHEMA } },
              }
            : {}),
          // No temperature / top_p: current Opus models reject them outright.
        }),
      });

      if (!res.ok) {
        throw new ProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
      }

      const body = (await res.json()) as AnthropicResponse;

      // A refusal is a successful 200 with empty content — check before reading it.
      if (body.stop_reason === "refusal") {
        throw new ProviderError(
          this.name,
          `request declined (${body.stop_details?.category ?? "no category"})`,
        );
      }

      return body.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    };
  }

  async generateTourPlan(input: TourRequest): Promise<TourPlan> {
    return generateTourPlanVia(this.name, this.complete(true), input);
  }

  async answerQuestion(input: AskRequest): Promise<string> {
    return answerQuestionVia(this.name, this.complete(false), input);
  }
}
