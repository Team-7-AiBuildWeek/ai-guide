/**
 * The tour prompts.
 *
 * Two of them, because a tour is built in two passes:
 *
 *  1. The itinerary — which places, in what order. Small, fast, and the only
 *     thing standing between a walker and a map with a route on it.
 *  2. One stop's narration at a time, written while the walk is under way.
 *
 * They were one prompt until a four-hour tour turned out to be twenty-plus
 * stops of five-minute narration: forty minutes of writing before anything
 * appeared on screen, well past every serverless timeout there is.
 *
 * Kept apart from provider code on purpose: this is the file that gets edited
 * fifty times while tuning the guide's voice, and it should never require
 * touching an API client to do it.
 */

import { languageName } from "@/lib/i18n/languages";
import type { Detail, Stop, TourRequest } from "@/lib/providers/types";

/**
 * Spoken words per minute.
 *
 * Measured against Gemini's own delivery on a narration script, which is
 * unhurried — a newsreader manages 160. Getting this wrong is what made
 * "3 minutes" arrive as ninety seconds.
 */
const WORDS_PER_MINUTE = 145;

/** Every stop is four to five minutes now; detail decides what fills them. */
const SCRIPT_MINUTES: Record<Detail, number> = {
  highlights: 4,
  story: 4.5,
  everything: 5,
};

export function scriptWords(detail: Detail): number {
  return Math.round(SCRIPT_MINUTES[detail] * WORDS_PER_MINUTE);
}

/** Below this a script has not been written, it has been sketched. */
export function scriptFloor(detail: Detail): number {
  return Math.round(scriptWords(detail) * 0.8);
}

const DETAIL_WORDS: Record<Detail, string> = {
  highlights: "The essentials, told well. One clear thread per stop.",
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
  nature: "parks, gardens, trees and water, and how the city grew around them",
  music: "music: who played here, where they played, and what the city sounded like",
  literature: "books and the writers who lived, drank and set their work here",
  sacred: "places of worship, what is believed in them, and who built them",
  royal: "rulers and power: who held it here, how they took it and how they lost it",
  legends: "legends, folklore and the stories the city tells about itself, true or not",
  conflict: "wars, occupations and the darker past, told plainly and without relish",
};

/** Minutes of walking between one stop and the next, by pace. */
const WALK_MINUTES: Record<TourRequest["pace"], number> = {
  relaxed: 4,
  steady: 6,
  "cover-ground": 9,
};

/**
 * How many stops actually fit in the time asked for.
 *
 * The old version was a flat "stops per hour" that ignored how long anyone
 * stands at a stop, so an afternoon returned the same six stops as an hour.
 * A stop costs its narration plus the walk to the next one, and that is the
 * whole calculation.
 */
export function stopCount(req: TourRequest): number {
  const perStop = SCRIPT_MINUTES[req.detail] + WALK_MINUTES[req.pace];
  return Math.max(3, Math.round(req.durationMinutes / perStop));
}

/** The shape of the time budget, for the prompt and for the UI. */
export function tourShape(req: TourRequest) {
  const stops = stopCount(req);
  const listening = Math.round(stops * SCRIPT_MINUTES[req.detail]);
  return { stops, listening, walking: Math.max(0, req.durationMinutes - listening) };
}

// --------------------------------------------------------------- itinerary --

export const ITINERARY_SYSTEM_PROMPT = `You are a walking-tour guide in the city you are given, where you have lived for thirty years and know it the way a person knows their own street.

You are choosing the stops for a walk. Not writing them yet — choosing them.

Every stop must be a real, specific, findable place in that city: a building, a square, a street, a monument that exists today and that someone standing there could point at. Never invent a place, never move a real one to a city it is not in, and never reach for a landmark from a different city because it fits the theme better.

If you do not know a city well enough to fill the time honestly, say so in the summary and choose the places you are sure of, however ordinary. A short honest walk beats a long invented one.

For every stop give BOTH names:
- name: what you call it when speaking to the walker, in their language.
- localName: exactly what is written on the building and on a local map, in the local language, with correct diacritics — "Michalská brána", not "Michael's Gate"; "Hlavné námestie", not "Main Square". This is what gets looked up against real map data, so it must be the real local name, not a translation.

angle is one sentence, to yourself, on why this stop earns its place and what its narration will be about. It is not spoken aloud.

Give your best coordinates. They will be checked against a map and corrected, so the localName matters more than the numbers.

THE NUMBER OF STOPS IS NOT A SUGGESTION. A walker who asked for four hours and is given a forty-minute walk has been let down more than one given no tour at all. Count them before you answer.`;

export function buildItineraryPrompt(req: TourRequest): string {
  const shape = tourShape(req);
  const interests =
    req.interests.length > 0
      ? req.interests.map((i) => INTEREST_WORDS[i]).join("; ")
      : "a general walk — whatever you would show a friend";

  const hours =
    req.durationMinutes >= 120
      ? ` — that is ${(req.durationMinutes / 60).toFixed(req.durationMinutes % 60 ? 1 : 0)} hours on foot`
      : "";

  const lines = [
    req.city
      ? `CITY: ${req.city.label}. Every stop is in this city and nowhere else.`
      : `City: not given — work it out from the coordinates below and name it in the summary.`,
    ``,
    `Language: write the title, summary and every name in ${languageName(req.lang)}.`,
    ``,
    `Start point: ${req.start.label ?? "unnamed spot"} at ${req.start.lat}, ${req.start.lng}.`,
    req.end
      ? `End point: ${req.end.label ?? "unnamed spot"} at ${req.end.lat}, ${req.end.lng}.`
      : `End point: none given — finish within a few minutes' walk of the start so the route loops.`,
    ``,
    `TIME ASKED FOR: ${req.durationMinutes} minutes${hours}.`,
    `That is roughly ${shape.listening} minutes of listening and ${shape.walking} minutes of walking.`,
    `Each stop gets ${SCRIPT_MINUTES[req.detail]} minutes of narration.`,
    ``,
    `GIVE EXACTLY ${shape.stops} STOPS. Not five, not "a few" — ${shape.stops}.`,
    req.durationMinutes >= 120
      ? `This is a long walk. Long walks need range: cross the river, climb the hill, ` +
        `leave the main square behind. ${shape.stops} stops crammed into one plaza is not a ${req.durationMinutes}-minute tour.`
      : ``,
    ``,
    `Pace: ${PACE_WORDS[req.pace]}`,
    `Depth: ${DETAIL_WORDS[req.detail]}`,
    `Interests: ${interests}.`,
  ];

  if (req.freeText?.trim()) {
    lines.push(
      ``,
      `THE WALKER'S OWN BRIEF — this is the whole point of the tour, and it outranks`,
      `every setting above wherever they disagree:`,
      ``,
      `"""${req.freeText.trim()}"""`,
      ``,
      `Build the tour around that. Every stop must earn its place against it. If`,
      `something they asked for genuinely does not exist in this city, say so plainly`,
      `in the summary and give them the nearest real thing instead of quietly`,
      `substituting a standard tour.`,
    );
  }

  lines.push(
    ``,
    `The summary is spoken aloud as the walk begins: two or three sentences telling`,
    `them what you have built and why it fits what they asked for.`,
    ``,
    `Order the stops into a sensible walking route — no doubling back, no crossing`,
    `the same square three times. The order will be checked against a map.`,
    `Return only the JSON object described by the schema. No preamble, no explanation.`,
  );

  return lines.join("\n");
}

// ------------------------------------------------------------ one stop's --

export const SCRIPT_SYSTEM_PROMPT = `You are a walking-tour guide writing the narration for one stop, to be spoken into someone's earbuds while they stand in front of it.

- Write for the ear, not the page. Short sentences. No bullet points, no headings, no markdown, no lists.
- Never write a stage direction, a timestamp, or a speaker label.
- Address the walker directly as "you". Point at what is physically in front of them.
- No travel-brochure adjectives. No "nestled", no "hidden gem", no "steeped in history". Say the concrete thing instead.
- Your listener is somewhere between 45 and 60, has travelled before, and does not need to be flattered.
- Everything you say must be true of this place. If you are unsure of a date or a name, write around it rather than inventing one.

walkingCueToHere is a spoken direction from the previous stop to this one: one or two sentences using what the walker can see — street names, a church on the right, a corner with a tram stop. For the first stop, describe how to get there from the given starting point.

Return only the JSON object described by the schema.`;

export function buildScriptPrompt(args: {
  req: TourRequest;
  stop: Stop;
  previous: Stop | null;
  position: number;
  total: number;
}): string {
  const { req, stop, previous, position, total } = args;
  const target = scriptWords(req.detail);
  const floor = scriptFloor(req.detail);

  const lines = [
    req.city ? `City: ${req.city.label}.` : ``,
    `Language: write in ${languageName(req.lang)}.`,
    ``,
    `THIS STOP: ${stop.name}${stop.localName && stop.localName !== stop.name ? ` (${stop.localName})` : ""}`,
    `Its place in the walk: stop ${position} of ${total}.`,
    `Why it is on the walk: ${stop.angle}`,
    `Where it is: ${stop.lat}, ${stop.lng}.`,
    ``,
    previous
      ? `They are walking here from ${previous.name}${previous.localName && previous.localName !== previous.name ? ` (${previous.localName})` : ""} at ${previous.lat}, ${previous.lng}.`
      : `They are walking here from the start: ${req.start.label ?? "an unnamed spot"} at ${req.start.lat}, ${req.start.lng}.`,
    ``,
    `Depth: ${DETAIL_WORDS[req.detail]}`,
    req.interests.length > 0
      ? `They care about: ${req.interests.map((i) => INTEREST_WORDS[i]).join("; ")}.`
      : ``,
  ];

  if (req.freeText?.trim()) {
    lines.push(
      ``,
      `Their own brief for the whole walk — make this stop answer it, explicitly:`,
      `"""${req.freeText.trim()}"""`,
    );
  }

  lines.push(
    ``,
    `LENGTH — this matters, and models routinely write half of what is asked:`,
    `  script: about ${target} words. Never fewer than ${floor}.`,
    `That is ${SCRIPT_MINUTES[req.detail]} minutes of speech. Count as you write.`,
    `A script under ${floor} words is a failed answer however good the prose is.`,
    `Keep going until the stop is genuinely covered — there is always more to say`,
    `about a real place than fits, so choose what is worth saying and say it fully.`,
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

// ------------------------------------------------------------------ schemas --

/**
 * JSON Schema for providers that support constrained decoding. Kept in step
 * with the Zod schemas in providers/types.ts — Zod remains the source of truth
 * at runtime, this is just a hint to the model.
 */
export const ITINERARY_JSON_SCHEMA = {
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
          angle: {
            type: "string",
            description: "One sentence to yourself on what this stop's narration is about.",
          },
        },
        required: ["id", "name", "localName", "lat", "lng", "angle"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "stops"],
  additionalProperties: false,
} as const;

export const STOP_SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    walkingCueToHere: {
      type: "string",
      description: "One or two spoken sentences getting them here from the previous stop.",
    },
    script: { type: "string", description: "The narration. See the word count given." },
  },
  required: ["walkingCueToHere", "script"],
  additionalProperties: false,
} as const;
