/**
 * Splitting narration into pieces that can be spoken one at a time.
 *
 * A five-minute script takes roughly half a minute to synthesise, and the
 * walker spends all of it looking at a spinner. Split it and the first piece
 * arrives in a few seconds; the rest are made while they listen to it.
 *
 * The first chunk is deliberately the shortest — it is the only one anybody
 * ever waits for. After that the chunks grow, because each one buys time for
 * the next and larger requests are cheaper per word.
 */

/** Roughly a spoken word per 0.41s, matching the prompt's 145 wpm. */
export const WORDS_PER_SECOND = 145 / 60;

/**
 * How big each piece should be, in words.
 *
 * It ramps, and the ramp is the whole design. The first piece is the only one
 * anybody waits for, so it is tiny; each one after that buys time to make the
 * next, so they grow. Flat 170-word pieces meant six synthesis calls for one
 * stop — six times what an unsplit script cost — which burns a free-tier quota
 * in under two stops for no benefit past the first few seconds.
 *
 * ~23s, then ~58s, then ~2¼ minutes each.
 */
const CHUNK_WORDS = [55, 140, 330];

const targetWords = (index: number) =>
  CHUNK_WORDS[Math.min(index, CHUNK_WORDS.length - 1)];

/**
 * Words whose full stop does not end a sentence.
 *
 * "The statue at the top is St. Michael" was being cut in two, and the second
 * recording opened with the word "Michael". Slovak, German and Italian names
 * are in here too because this app is no longer only in English.
 */
const ABBREVIATIONS = new Set([
  "st", "str", "mr", "mrs", "ms", "dr", "prof", "rev", "jr", "sr", "no", "vs",
  "approx", "c", "ca", "cca", "fig", "vol", "pp", "etc", "sv", "ul", "nám",
  "č", "hl", "nr", "bzw", "ggf", "sig", "sig.ra", "via", "p", "pl",
]);

/**
 * Sentence ends, not word counts.
 *
 * Cutting mid-sentence is audible even when the pieces join seamlessly: the
 * voice takes a breath in the wrong place. Written as a scan for split points
 * rather than a match for sentence bodies, because a match-based version
 * silently dropped four words of a hundred and fifty — text that falls between
 * two matches simply never appears, and nothing complains.
 */
function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!/[.!?…]/.test(text[i])) continue;
    // Runs of terminators ("?!", "...") belong to the sentence they close.
    let end = i;
    while (end + 1 < text.length && /[.!?…]/.test(text[end + 1])) end++;

    const after = text.slice(end + 1);
    const gap = after.match(/^\s+(["“„'(]?)(.?)/u);
    if (!gap) break; // end of the text: the tail is added below
    // A sentence starts with a capital or a digit. Anything else — "a. m." —
    // is punctuation inside one.
    if (!/[A-ZÁ-ŽÀ-Ý0-9]/u.test(gap[2] ?? "")) {
      i = end;
      continue;
    }
    const lastWord = (text.slice(start, i).match(/([\p{L}]+)$/u)?.[1] ?? "").toLowerCase();
    if (ABBREVIATIONS.has(lastWord)) {
      i = end;
      continue;
    }

    out.push(text.slice(start, end + 1).trim());
    start = end + 1 + gap[0].length - (gap[1]?.length ?? 0) - (gap[2]?.length ?? 0);
    i = start - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : [text.trim()];
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Split a script into speakable chunks.
 *
 * Never returns an empty chunk, and never splits a sentence — a chunk longer
 * than the target is a long sentence, which is better spoken whole.
 */
export function chunkScript(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const parts = sentences(clean);
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;

  for (const part of parts) {
    current.push(part);
    words += wordCount(part);
    if (words >= targetWords(chunks.length)) {
      chunks.push(current.join(" "));
      current = [];
      words = 0;
    }
  }
  if (current.length > 0) {
    // A stray few words are tacked onto the previous chunk rather than left as
    // a two-second recording of their own.
    if (chunks.length > 0 && words < 25) chunks[chunks.length - 1] += ` ${current.join(" ")}`;
    else chunks.push(current.join(" "));
  }
  return chunks;
}

/** How long a chunk will take to speak, before it exists. Used for the
 *  scrubber, which otherwise has no total until the last piece has arrived. */
export function estimateSeconds(text: string): number {
  return wordCount(text) / WORDS_PER_SECOND;
}
