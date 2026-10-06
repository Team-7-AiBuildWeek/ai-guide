/**
 * The website's lib/audio/chunk.ts, unchanged in behaviour: narration is
 * voiced in pieces that grow (a short first one, so the walk starts sooner),
 * cut at sentence ends. The server cuts the opening with the same rules, which
 * is what lets the first piece be voiced before the walk begins.
 */

export const WORDS_PER_SECOND = 145 / 60;

const CHUNK_WORDS = [55, 140, 330];
const targetWords = (index: number) => CHUNK_WORDS[Math.min(index, CHUNK_WORDS.length - 1)];

const ABBREVIATIONS = new Set([
  "st", "str", "mr", "mrs", "ms", "dr", "prof", "rev", "jr", "sr", "no", "vs",
  "approx", "c", "ca", "cca", "fig", "vol", "pp", "etc", "sv", "ul", "nám",
  "č", "hl", "nr", "bzw", "ggf", "sig", "sig.ra", "via", "p", "pl",
]);

function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?…]/.test(text[i])) continue;
    let end = i;
    while (end + 1 < text.length && /[.!?…]/.test(text[end + 1])) end++;
    const after = text.slice(end + 1);
    const gap = after.match(/^\s+(["“„'(]?)(.?)/u);
    if (!gap) break;
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

export function chunkScript(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const part of sentences(clean)) {
    current.push(part);
    words += wordCount(part);
    if (words >= targetWords(chunks.length)) {
      chunks.push(current.join(" "));
      current = [];
      words = 0;
    }
  }
  if (current.length > 0) {
    if (chunks.length > 0 && words < 25) chunks[chunks.length - 1] += ` ${current.join(" ")}`;
    else chunks.push(current.join(" "));
  }
  return chunks;
}

export function estimateSeconds(text: string): number {
  return wordCount(text) / WORDS_PER_SECOND;
}
