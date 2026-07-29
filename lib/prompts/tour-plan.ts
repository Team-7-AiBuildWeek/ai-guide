/**
 * The tour-planning prompt.
 *
 * Kept apart from provider code on purpose: this is the file that gets edited
 * fifty times while tuning the guide's voice, and it should never require
 * touching an API client to do it.
 */

import type { Detail, TourRequest } from "@/lib/providers/types";

/**
 * How much the walker actually asked for.
 *
 * Models under-write when given a vague "about three minutes" — they land at
 * half of it. Naming a floor and a ceiling in words, and repeating the floor
 * as a hard rule further down, is what makes the long version genuinely long.
 */
const LENGTH: Record<Detail, { short: number; full: number; label: string }> = {
  highlights: { short: 80, full: 260, label: "Just the highlights" },
  story: { short: 110, full: 480, label: "A good story" },
  everything: { short: 130, full: 800, label: "Tell me everything" },
};

const DETAIL_WORDS: Record<Detail, string> = {
  highlights: "The essentials, briskly. One idea per stop, no digressions.",
  story: "One strong narrative per stop, with room for a detail that sticks.",
  everything:
    "Depth. Dates, names, the argument about what really happened, the side-story " +
    "most guides leave out. Assume genuine curiosity and plenty of time.",
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

export const SYSTEM_PROMPT = `You are a walking-tour guide in the city you are given, where you have lived for thirty years and know it the way a person knows their own street.

Every stop must be a real, specific, findable place in that city — a building, a square, a street, a monument that exists today and that someone standing there could point at. Never invent a place, never move a real one to a city it is not in, and never reach for a landmark from a different city because it fits the theme better.

If you do not know a city well enough to write eight true paragraphs about it, say so in the summary and build the walk from the places you are sure of, however ordinary. A short honest walk beats a long invented one.

You are writing audio narration. It will be spoken aloud into someone's earbuds while they walk, so:
- Write for the ear, not the page. Short sentences. No bullet points, no headings, no markdown, no lists.
- Never write a stage direction, a timestamp, or a speaker label.
- Address the walker directly as "you". Point at what is physically in front of them.
- No travel-brochure adjectives. No "nestled", no "hidden gem", no "steeped in history". Say the concrete thing instead.
- Your listener is somewhere between 45 and 60, has travelled before, and does not need to be flattered.

Every stop needs two versions of the same material. The full version must not read as the short version with padding bolted on — write it as its own piece, with its own shape.

walkingCueToHere is a spoken direction from the previous stop to this one, one or two sentences, using what the walker can see: street names, a church on the right, a corner with a tram stop. For the first stop, describe how to get there from the given starting point.

For every stop give BOTH names:
- name: what you call it when speaking to the walker, in their language.
- localName: exactly what is written on the building and on a local map, in the
  local language, with correct diacritics — "Michalská brána", not "Michael's
  Gate"; "Hlavné námestie", not "Main Square". This is what gets looked up
  against real map data, so it must be the real local name, not a translation.

Give your best coordinates, but they will be checked against a map and
corrected, so the localName matters more than the numbers.`;

export function buildTourPlanPrompt(req: TourRequest): string {
  const count = stopCount(req);
  const len = LENGTH[req.detail];
  const interests =
    req.interests.length > 0
      ? req.interests.map((i) => INTEREST_WORDS[i]).join("; ")
      : "a general walk — whatever you would show a friend";

  const lines = [
    req.city
      ? `CITY: ${req.city.label}. Every stop is in this city and nowhere else.`
      : `City: not given — work it out from the coordinates below and name it in the summary.`,
    ``,
    `Language: write every script and cue in ${req.lang === "sk" ? "Slovak" : "English"}.`,
    ``,
    `Start point: ${req.start.label ?? "unnamed spot"} at ${req.start.lat}, ${req.start.lng}.`,
    req.end
      ? `End point: ${req.end.label ?? "unnamed spot"} at ${req.end.lat}, ${req.end.lng}.`
      : `End point: none given — finish within a few minutes' walk of the start so the route loops.`,
    ``,
    `Time available: ${req.durationMinutes} minutes of walking and listening.`,
    `Aim for ${count} stops.`,
    `Pace: ${PACE_WORDS[req.pace]}`,
    `Depth: ${len.label}. ${DETAIL_WORDS[req.detail]}`,
    `Interests: ${interests}.`,
    ``,
    `LENGTH — this matters, and models routinely under-write it:`,
    `  scriptShort: about ${len.short} words. Never fewer than ${Math.round(len.short * 0.8)}.`,
    `  scriptFull:  about ${len.full} words. Never fewer than ${Math.round(len.full * 0.8)}.`,
    `Count as you write. A scriptFull under ${Math.round(len.full * 0.8)} words is a failed answer,`,
    `however good the prose is. Keep going until the stop is genuinely covered.`,
  ];

  if (req.freeText?.trim()) {
    lines.push(
      ``,
      `THE WALKER'S OWN BRIEF — this is the whole point of the tour, and it outranks`,
      `every setting above wherever they disagree:`,
      ``,
      `"""${req.freeText.trim()}"""`,
      ``,
      `Build the tour around that. Every stop must earn its place against it: choose`,
      `stops that answer it, and in each script make the connection explicit rather`,
      `than leaving it implied. If they asked about one subject, that subject is the`,
      `spine of the walk, not a paragraph in stop four. If something they asked for`,
      `genuinely does not exist in this city, say so plainly in the summary and give`,
      `them the nearest real thing instead of quietly substituting a standard tour.`,
    );
  }

  lines.push(
    ``,
    `The summary is spoken aloud as the walk begins: two or three sentences telling`,
    `them what you have built and why it fits what they asked for.`,
    ``,
    `Order the stops into a sensible walking route — no doubling back, no crossing the same square three times.`,
    `Return only the JSON object described by the schema. No preamble, no explanation.`,
  );

  return lines.join("\n");
}

/** Word floors used to decide whether a returned plan is worth accepting. */
export function lengthFloors(detail: Detail) {
  const len = LENGTH[detail];
  return { short: Math.round(len.short * 0.7), full: Math.round(len.full * 0.7) };
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
    summary: {
      type: "string",
      description: "Two or three sentences, spoken aloud, saying how this fits what they asked for.",
    },
    stops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "kebab-case slug, unique in this tour" },
          name: { type: "string", description: "Spoken name, in the walker's language." },
          localName: {
            type: "string",
            description: "The real local name as on the map and the building, with diacritics.",
          },
          lat: { type: "number" },
          lng: { type: "number" },
          walkingCueToHere: { type: "string" },
          scriptShort: { type: "string", description: "Spoken narration, see the word count given." },
          scriptFull: { type: "string", description: "Spoken narration, much longer than scriptShort." },
        },
        required: ["id", "name", "localName", "lat", "lng", "walkingCueToHere", "scriptShort", "scriptFull"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "stops"],
  additionalProperties: false,
} as const;
