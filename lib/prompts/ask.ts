/**
 * The "ask anything" prompt.
 *
 * The whole reason this is a separate prompt rather than a generic chatbot is
 * that the walker already told us what they came for. An answer that ignores
 * that brief is the same answer they could have got from any search engine,
 * standing in the same square.
 */

import { languageName } from "@/lib/i18n/languages";
import type { AskRequest } from "@/lib/providers/types";

const INTEREST_WORDS: Record<AskRequest["interests"][number], string> = {
  history: "history and the people who lived it",
  architecture: "architecture and how buildings were made",
  food: "food and everyday life",
  art: "art and who paid for it",
  hidden: "corners most visitors miss",
};

const DEPTH_WORDS: Record<AskRequest["detail"], string> = {
  highlights: "Answer in about 40 spoken words. One fact, well chosen.",
  story: "Answer in about 70 spoken words. Room for one detail that sticks.",
  everything: "Answer in about 130 spoken words. They want the whole thing.",
};

export const ASK_SYSTEM_PROMPT = `You are the guide whose voice this walker has been listening to for the last half hour. They have stopped in the street to ask you something.

You are speaking, not writing. No markdown, no lists, no headings. Short sentences. Plain words.

Answer the question that was asked, first sentence. Then, only if it earns its place, one more thing worth knowing.

If you do not know, say so in one sentence and say what you do know that is close. Never invent a date, a name, or an attribution — a walker standing in front of the building will find out, and a guide who makes things up is worth nothing.`;

export function buildAskPrompt(req: AskRequest): string {
  const lines: string[] = [];

  if (req.freeText?.trim()) {
    lines.push(
      `When this walker set out, they asked for: """${req.freeText.trim()}"""`,
      `Answer in a way that connects to that wherever it honestly does.`,
      ``,
    );
  }

  if (req.interests.length > 0) {
    lines.push(
      `They told you they care about: ${req.interests.map((i) => INTEREST_WORDS[i]).join("; ")}.`,
    );
  }
  lines.push(DEPTH_WORDS[req.detail], ``);

  if (req.city) lines.push(`They are in ${req.city}. Answer about this city, not another.`);
  if (req.tourTitle) lines.push(`They are on your tour, "${req.tourTitle}".`);
  if (req.stopName) lines.push(`They are standing at ${req.stopName}.`);
  if (typeof req.lat === "number" && typeof req.lng === "number") {
    lines.push(`Their position is ${req.lat.toFixed(5)}, ${req.lng.toFixed(5)}.`);
  }
  if (req.stopContext?.trim()) {
    lines.push(``, `What you have already told them about this stop:`, `"""${req.stopContext.trim()}"""`, `Do not simply repeat it.`);
  }

  lines.push(
    ``,
    `Reply in ${languageName(req.lang)}.`,
    ``,
    `Their question: """${req.question.trim()}"""`,
    ``,
    `Give only the spoken answer. No preamble, no sign-off.`,
  );

  return lines.join("\n");
}
