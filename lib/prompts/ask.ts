/**
 * The "ask anything" prompt.
 *
 * The whole reason this is a separate prompt rather than a generic chatbot is
 * that the walker already told us what they came for. An answer that ignores
 * that brief is the same answer they could have got from any search engine,
 * standing in the same square.
 */

import { languageName } from "@/lib/i18n/languages";
import { haversine } from "@/lib/providers/maps";
import type { AskRequest } from "@/lib/providers/types";

const INTEREST_WORDS: Record<AskRequest["interests"][number], string> = {
  history: "history and the people who lived it",
  architecture: "architecture and how buildings were made",
  food: "food and everyday life",
  art: "art and who paid for it",
  hidden: "corners most visitors miss",
  nature: "parks, gardens and water",
  music: "music and who played it here",
  literature: "books and the writers who lived here",
  sacred: "places of worship and what is believed in them",
  royal: "rulers and who held power",
  legends: "legends and folklore",
  conflict: "wars and the darker past",
};

const DEPTH_WORDS: Record<AskRequest["detail"], string> = {
  highlights: "Answer in about 40 spoken words. One fact, well chosen.",
  story: "Answer in about 70 spoken words. Room for one detail that sticks.",
  everything: "Answer in about 130 spoken words. They want the depth, not the summary.",
};

export const ASK_SYSTEM_PROMPT = `You are the guide whose voice this walker has been listening to for the last half hour. They have stopped in the street to ask you something.

You are speaking, not writing. No markdown, no lists, no headings. Short sentences. Plain words.

Answer the question that was asked, first sentence. Then, only if it earns its place, one more thing worth knowing.

If you do not know, say so in one sentence and say what you do know that is close. Never invent a date, a name, or an attribution — a walker standing in front of the building will find out, and a guide who makes things up is worth nothing.

When they ask what they are looking at, or what something nearby is, work it out from where they are standing — you will be given the places around them from the map, with distances and directions. Reason it through before you answer, but say only the conclusion:
- Prefer what is straight ahead or ahead to one side, and close. A landmark beats a shop beside it.
- If they are within a few dozen metres of the stop and facing it, it is most likely the stop.
- If their position is uncertain or two places fit equally, name the likeliest and give them one thing to check with their eyes ("if there is a giant red lantern in the gate, that's Kaminarimon").
- Never say something is in front of them unless it is in the list or is the stop itself. If nothing fits, say what is nearby and in which direction instead.
- Use "on your left" and "behind you" only when the directions you were given say so; without a compass you only know compass directions.`;

function compassWord(deg: number): string {
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][
    Math.round((((deg % 360) + 360) % 360) / 45) % 8
  ];
}

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
  const hasFix = typeof req.lat === "number" && typeof req.lng === "number";
  if (req.stopName) {
    const away =
      hasFix && typeof req.stopLat === "number" && typeof req.stopLng === "number"
        ? haversine({ lat: req.lat!, lng: req.lng! }, { lat: req.stopLat, lng: req.stopLng })
        : null;
    lines.push(
      away === null
        ? `They are on the stop "${req.stopName}"; their exact position is not known.`
        : away <= 40
          ? `They are at the stop "${req.stopName}", about ${Math.round(away)} m from it.`
          : `The stop they are on is "${req.stopName}", about ${Math.round(away)} m away — they are not standing at it yet.`,
    );
  }
  if (hasFix) {
    const acc = typeof req.accuracy === "number" ? Math.round(req.accuracy) : null;
    lines.push(
      `Their GPS position is ${req.lat!.toFixed(5)}, ${req.lng!.toFixed(5)}` +
        (acc === null ? "." : acc <= 25 ? `, good to about ${acc} m.` : `, but only good to about ${acc} m — treat the nearest places with caution.`),
    );
    lines.push(
      typeof req.heading === "number"
        ? `Their phone is pointing ${compassWord(req.heading)} (${Math.round(req.heading)}°); directions below are relative to that.`
        : `Their phone has no compass reading, so directions below are compass directions, not left and right.`,
    );
  }
  if (req.surroundings?.length) {
    lines.push(``, `Named places around them, from the map, likeliest first:`, ...req.surroundings.map((l) => `- ${l}`));
  } else if (hasFix) {
    lines.push(`The map of their surroundings could not be read; go by the stop and say so if you are unsure.`);
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
