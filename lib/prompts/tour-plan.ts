/**
 * The tour-planning prompt.
 *
 * Kept apart from provider code on purpose: this is the file that gets edited
 * fifty times while tuning the guide's voice, and it should never require
 * touching an API client to do it.
 */

import type { TourRequest } from "@/lib/providers/types";

const DETAIL_WORDS: Record<TourRequest["detail"], string> = {
  highlights: "Just the highlights — the walker wants the essentials, briskly.",
  story: "A good story — one strong narrative per stop, with a little colour.",
  everything: "Tell me everything — depth, dates, side-stories, the lot.",
};

const PACE_WORDS: Record<TourRequest["pace"], string> = {
  relaxed: "Relaxed: more stops, short distances between them, plenty of standing still.",
  steady: "Steady: a normal walking rhythm.",
  "cover-ground": "Cover more ground: fewer stops, longer walks, a wider loop.",
};

const INTEREST_WORDS: Record<TourRequest["interests"][number], string> = {
  history: "history and the people who lived it",
  architecture: "architecture and how the buildings were made",
  food: "food and everyday life, then and now",
  art: "art and what it meant to the people who paid for it",
  hidden: "hidden corners most visitors walk straight past",
};

/** Roughly how many stops fit in the time, given the pace. */
function stopCount(req: TourRequest): number {
  const perHour = req.pace === "relaxed" ? 8 : req.pace === "steady" ? 6 : 4;
  return Math.max(3, Math.round((req.durationMinutes / 60) * perHour));
}

export const SYSTEM_PROMPT = `You are a walking-tour guide who has lived in this city for thirty years and knows it the way a person knows their own street.

You are writing audio narration. It will be spoken aloud into someone's earbuds while they walk, so:
- Write for the ear, not the page. Short sentences. No bullet points, no headings, no markdown, no lists.
- Never write a stage direction, a timestamp, or a speaker label.
- Address the walker directly as "you". Point at what is physically in front of them.
- No travel-brochure adjectives. No "nestled", no "hidden gem", no "steeped in history". Say the concrete thing instead.
- Your listener is somewhere between 45 and 60, has travelled before, and does not need to be flattered.

Every stop needs two versions of the same material:
- scriptShort: about 40 seconds spoken, roughly 100 words. The one thing worth knowing, said well.
- scriptFull: about 3 minutes spoken, roughly 450 words. The same stop with room to breathe — the story, the detail, the thing that makes it stick.

The full version must not read as the short version with padding bolted on. Write it as its own piece.

walkingCueToHere is a spoken direction from the previous stop to this one, one or two sentences, using what the walker can see: street names, a church on the right, a corner with a tram stop. For the first stop, describe how to get there from the given starting point.

Coordinates must be real. If you are not certain of a place's coordinates, choose somewhere you are certain about instead.`;

export function buildTourPlanPrompt(req: TourRequest): string {
  const count = stopCount(req);
  const interests =
    req.interests.length > 0
      ? req.interests.map((i) => INTEREST_WORDS[i]).join("; ")
      : "a general walk — whatever you would show a friend";

  const lines = [
    `Language: write every script and cue in ${req.lang === "sk" ? "Slovak" : "English"}.`,
    ``,
    `Start point: ${req.start.label ?? "unnamed spot"} at ${req.start.lat}, ${req.start.lng}.`,
    req.end
      ? `End point: ${req.end.label ?? "unnamed spot"} at ${req.end.lat}, ${req.end.lng}.`
      : `End point: none given — finish within a few minutes' walk of the start so the route loops.`,
    ``,
    `Time available: ${req.durationMinutes} minutes of walking and listening.`,
    `Aim for ${count} stops.`,
    `Depth: ${DETAIL_WORDS[req.detail]}`,
    `Pace: ${PACE_WORDS[req.pace]}`,
    `Interests: ${interests}.`,
  ];

  if (req.freeText?.trim()) {
    lines.push(
      ``,
      `The walker described what they want in their own words. This outranks the settings above where they disagree:`,
      `"""${req.freeText.trim()}"""`,
    );
  }

  lines.push(
    ``,
    `Order the stops into a sensible walking route — no doubling back, no crossing the same square three times.`,
    `Return only the JSON object described by the schema. No preamble, no explanation.`,
  );

  return lines.join("\n");
}

/**
 * JSON Schema for providers that support constrained decoding. Kept in step
 * with TourPlanSchema in providers/types.ts — Zod remains the source of truth
 * at runtime, this is just a hint to the model.
 */
export const TOUR_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short name for the tour." },
    summary: { type: "string", description: "Two sentences, spoken aloud as the intro." },
    stops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "kebab-case slug, unique in this tour" },
          name: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          walkingCueToHere: { type: "string" },
          scriptShort: { type: "string", description: "~100 words" },
          scriptFull: { type: "string", description: "~450 words" },
        },
        required: ["id", "name", "lat", "lng", "walkingCueToHere", "scriptShort", "scriptFull"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "stops"],
  additionalProperties: false,
} as const;
