"use client";

/**
 * How long the walker said they have, in their own words.
 *
 * The free-text box is the default way in, and it had no duration control
 * beside it — so "I have all afternoon" went into the prompt as the brief
 * while the request still said forty-five minutes. The model dutifully
 * acknowledged the afternoon in its summary and then built a three-stop walk,
 * which is exactly the contradiction it was handed.
 *
 * Parsed on the client rather than asked of the model, so the slider visibly
 * moves as the sentence is typed: the walker can see what was understood, and
 * disagree with it, before anything is generated.
 */

import type { Duration } from "@/lib/providers/types";

const ALLOWED: Duration[] = [30, 45, 60, 90, 120, 180, 240];

/** Nearest offered length, so a parsed "2h20" becomes something selectable. */
function snap(minutes: number): Duration {
  return ALLOWED.reduce((best, d) =>
    Math.abs(d - minutes) < Math.abs(best - minutes) ? d : best,
  );
}

/**
 * Words that turn a vague noun into a claim about the speaker's own time.
 *
 * "afternoon" and "day" need one of these in front of them, or "the afternoon
 * sun" and "market day" both set a four-hour walk.
 * Slovak has no articles, so "mám" and "celé" do the work "I have all" does.
 */
const MINE = String.raw`(all|whole|entire|have|got|spend|free|mám|mam|cel[ýyéeíiuú]\w*)`;

const PHRASES: [RegExp, number][] = [
  [new RegExp(String.raw`\b${MINE}\b[^.!?]{0,20}\b(day|deň|den)\b`, "iu"), 240],
  [new RegExp(String.raw`\b${MINE}\b[^.!?]{0,20}\b(afternoon|popoludnie|poobede)\b`, "iu"), 240],
  [/\b(half\s+a\s+day|pol\s*dňa|pol\s*dna)\b/iu, 240],
  [new RegExp(String.raw`\b${MINE}\b[^.!?]{0,20}\b(morning|dopoludnia|doobeda)\b`, "iu"), 180],
  [/\b(a\s+)?(couple|few|pár|par)\s+(of\s+)?(hours|hodín|hodin|hodiny)\b/iu, 120],
  [/\b(half\s+an?\s+hour|pol\s*hodiny|polhodin\w*)\b/iu, 30],
  [/\b(an?|one)\s+(hour|hodinu|hodina)\b/iu, 60],
  // Slovak drops the article: "mám hodinu" is "I have an hour".
  [/\bhodinu\b/iu, 60],
  [/\b(quick|short|brief|rýchl\w*|krátk\w*)\b/iu, 30],
];

/** Numbers written out, because "two hours" is as common as "2 hours". */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  jedn: 1, dve: 2, tri: 3, štyri: 4, styri: 4, päť: 5, pat: 5, šesť: 6, sest: 6,
};

export function parseDuration(text: string): Duration | null {
  const t = text.trim();
  if (!t) return null;

  // Explicit numbers first — they are the least ambiguous thing in the box.
  const halfHours = t.match(/\b(\d+)\s*(?:½|and\s+a\s+half|\.5)\s*(hours?|hrs?|hodín|hodin|hod)\b/iu);
  if (halfHours) return snap(Number(halfHours[1]) * 60 + 30);

  const hours = t.match(/\b(\d+)\s*(hours?|hrs?\b|h\b|hodín|hodin|hod\b)/iu);
  if (hours) return snap(Number(hours[1]) * 60);

  const wordHours = t.match(
    /\b(one|two|three|four|five|six|jedn\w*|dve|tri|štyri|styri|päť|pat|šesť|sest)\s+(hours?|hodiny|hodín|hodin)\b/iu,
  );
  if (wordHours) {
    const key = Object.keys(WORD_NUMBERS).find((k) => wordHours[1].toLowerCase().startsWith(k));
    if (key) return snap(WORD_NUMBERS[key] * 60);
  }

  const minutes = t.match(/\b(\d+)\s*(minutes?|mins?\b|min\b|minút|minut)\b/iu);
  if (minutes) return snap(Number(minutes[1]));

  for (const [re, mins] of PHRASES) {
    if (re.test(t)) return snap(mins);
  }
  return null;
}

/** How the parsed value reads back to the walker. */
export function durationLabel(d: Duration): string {
  if (d < 60) return `${d} minutes`;
  if (d === 60) return "1 hour";
  if (d === 90) return "1½ hours";
  if (d === 240) return "a whole afternoon";
  return `${d / 60} hours`;
}
