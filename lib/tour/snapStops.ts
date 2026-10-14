/**
 * Put every stop where it actually is.
 *
 * A language model gives plausible coordinates, not correct ones — measured at
 * 11–183 m out on a real tour, which in an old town is the wrong side of a
 * square or the wrong building entirely, and close to a kilometre out on a
 * Singapore one (Keppel Discovery Wetlands, guessed at the wrong end of the
 * Botanic Gardens). So the names it returns are looked up against real map
 * data and the coordinates replaced.
 *
 * Matching is by name first, distance second:
 *
 *  - a map feature whose name *is* the stop's name may move the stop anywhere
 *    in the walk's area — the model's guess says nothing once the place itself
 *    has been found. A far move needs the name to be unambiguous there (one
 *    feature by that name) or Wikipedia to agree on where it is.
 *  - a feature that only resembles the name may move it a short way, the
 *    "wrong building" case.
 *  - a feature that merely happens to be near is never taken: the geocoder
 *    always returns *something*, and "Keppel Land Bugis Towers" is not the
 *    wetlands.
 *
 * Where the map has nothing, Wikipedia's coordinates for an article of that
 * name are tried. A stop neither can place is dropped rather than drawn where
 * the model imagined it — unless that would gut the walk, in which case it is
 * kept and reported as estimated.
 *
 * Server-side: it needs the map provider.
 */

import type { MapProvider } from "@/lib/providers/maps";
import { haversine } from "@/lib/providers/maps";
import type { Place, Stop } from "@/lib/providers/types";

/** The smallest area searched around the start, and the largest. */
const MIN_SEARCH_KM = 3;
const MAX_SEARCH_KM = 10;
/** Beyond the farthest guessed stop: guesses can be wrong by this much and still be found. */
const SEARCH_MARGIN_KM = 1.5;

/**
 * How far a feature that only resembles the stop's name may move it. Generous
 * enough to fix a wrong building, tight enough not to teleport the stop across
 * the city on the strength of a shared word.
 */
const MAX_LOOSE_CORRECTION_M = 600;
/** Two sources this close together agree on where a place is. */
const AGREE_M = 400;

const WIKI_TIMEOUT_MS = 4000;
const AGENT = "walk-audio-tours/1.0 (https://github.com/Team-7-AiBuildWeek/ai-guide)";

export type SnapResult = {
  stops: Stop[];
  corrected: number;
  /** Kept at the model's estimate: nothing could place them, and dropping them would leave too little walk. */
  unmatched: string[];
  /** Dropped: nothing could place them. */
  dropped: string[];
};

type LatLng = { lat: number; lng: number };
/** `rank` is the source's own order for the query: 0 is what it thinks was meant. */
type Candidate = LatLng & { name: string; source: "map" | "wikipedia"; rank: number };

// ------------------------------------------------------------ name matching

/** "St. Michael's Gate (Bratislava)" → "st michael s gate". */
export function normaliseName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // Wikipedia's "(Singapore)" disambiguators
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How alike two names are, 0–1. 1 is the same name; containment ("Michael's
 * Gate" in "St Michael's Gate") scores high but below that, so a shop called
 * "Gardens Shop Singapore Botanic Gardens" never beats the gardens themselves.
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = new Set(x.split(" "));
  const B = new Set(y.split(" "));
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  const jaccard = shared / (A.size + B.size - shared);
  const contained = shared === Math.min(A.size, B.size) && Math.min(A.size, B.size) >= 2;
  return Math.max(jaccard, contained ? 0.8 : 0);
}

/** The same place by name: exactly, or near enough that only punctuation or a prefix differs. */
const STRONG = 0.8;
/** Resembles it: enough for a short correction, never for a long one. */
const LOOSE = 0.5;

// ------------------------------------------------------------------ lookups

/** Before asking the map again after a refusal. */
const RETRY_MS = 1200;
/** Stops looked up at once: all of a long walk together trips the map's rate limit. */
const AT_ONCE = 3;

/** Per process: the same stop is looked up again on every rebuild and every language. */
const cache = new Map<string, Promise<Candidate[]>>();
const CACHE_MAX = 1000;

function cached(key: string, load: () => Promise<Candidate[]>): Promise<Candidate[]> {
  const hit = cache.get(key);
  if (hit) return hit;
  // A refused lookup (the map's rate limit, a timeout) is tried once more
  // after a moment: "the map was busy" must never read as "no such place",
  // which is what dropped the Vienna State Opera from a walk.
  const p = load()
    .catch(() => new Promise<Candidate[]>((resolve, reject) => setTimeout(() => load().then(resolve, reject), RETRY_MS)))
    .catch(() => {
      cache.delete(key); // a failure is not an answer; ask again next time
      return [] as Candidate[];
    });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, p);
  return p;
}

function areaKey(area: LatLng & { radiusKm: number }): string {
  return `${area.lat.toFixed(3)},${area.lng.toFixed(3)},${area.radiusKm.toFixed(1)}`;
}

function fromMap(maps: MapProvider, query: string, area: LatLng & { radiusKm: number }): Promise<Candidate[]> {
  return cached(`map|${maps.name}|${query}|${areaKey(area)}`, async () => {
    // "precise" matters more than it looks: without it "Stephansdom" matches
    // the Vienna district of that name and moves the cathedral 439 m up the road.
    const places: Place[] = await maps.geocode(query, { bounds: area, kind: "precise" });
    return places.map((p, rank) => ({ name: p.name, lat: p.lat, lng: p.lng, source: "map" as const, rank }));
  });
}

/** Articles matching the name, with coordinates, inside the area. */
function fromWikipedia(query: string, area: LatLng & { radiusKm: number }, wiki = "en"): Promise<Candidate[]> {
  return cached(`wiki|${wiki}|${query}|${areaKey(area)}`, async () => {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "6",
      prop: "coordinates",
      colimit: "max",
      redirects: "1",
    });
    const res = await fetch(`https://${wiki}.wikipedia.org/w/api.php?${params}`, {
      headers: { "user-agent": AGENT },
      signal: AbortSignal.timeout(WIKI_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      query?: { pages?: Record<string, { title: string; index?: number; coordinates?: { lat: number; lon: number }[] }> };
    };
    return Object.values(body.query?.pages ?? {})
      .filter((p) => p.coordinates?.length)
      .map((p) => ({
        name: p.title,
        lat: p.coordinates![0].lat,
        lng: p.coordinates![0].lon,
        source: "wikipedia" as const,
        rank: (p.index ?? 100) - 1, // the API counts from 1
      }))
      .filter((c) => haversine(area, c) <= area.radiusKm * 1000);
  });
}

// ------------------------------------------------------------------ placing

type Placed = { lat: number; lng: number } | null;

/**
 * Where a stop really is, or null when nothing trustworthy says.
 *
 * `names` are the stop's local name and its English name; a candidate counts
 * by the better of the two.
 */
function choose(guess: LatLng, names: string[], map: Candidate[], wiki: Candidate[]): Placed {
  const score = (c: Candidate) => Math.max(...names.map((n) => nameSimilarity(n, c.name)));
  const strongMap = map.filter((c) => score(c) >= STRONG);
  const strongWiki = wiki.filter((c) => score(c) >= STRONG);
  const agreesWithWiki = (c: LatLng) => strongWiki.some((w) => haversine(c, w) <= AGREE_M);

  if (strongMap.length) {
    // Best name, then nearest to the guess (several branches of one chain).
    const best = [...strongMap].sort((a, b) => score(b) - score(a) || haversine(guess, a) - haversine(guess, b))[0];
    const moved = haversine(guess, best);
    if (moved <= MAX_LOOSE_CORRECTION_M) return best;
    // A long move on the map's word alone needs the name to be unambiguous in
    // this area: one feature by that name (entrances and boards of the same
    // place sit together, so they count as one), or Wikipedia agreeing.
    const distinct = strongMap.filter((c) => haversine(c, best) > AGREE_M);
    if (distinct.length === 0 || agreesWithWiki(best)) return best;
  }

  if (strongWiki.length) {
    const best = [...strongWiki].sort((a, b) => score(b) - score(a) || haversine(guess, a) - haversine(guess, b))[0];
    // Wikipedia's point for a big place is its middle, which is where a
    // walking guide would stand anyway; prefer the map's point if it agrees.
    const onMap = map.find((c) => score(c) >= LOOSE && haversine(c, best) <= AGREE_M);
    return onMap ?? best;
  }

  // Only a resemblance, or the geocoder's own first answer — which matches
  // alternative names too, so it can come back as a translation ("Milion" for
  // "Milyon Taşı", "Basilica Cistern" for "Yerebatan Sarnıcı"): a short
  // correction, the wrong-building case. Never the nearest thing that merely
  // turned up — that once put Symphony Lake on a statue of Chopin.
  const loose = [...map, ...wiki]
    // (The map's first answer only: Wikipedia's is a full-text search, and its
    // top hit for a palace's council chamber is the palace.)
    .filter((c) => (score(c) >= LOOSE || (c.source === "map" && c.rank === 0)) && haversine(guess, c) <= MAX_LOOSE_CORRECTION_M)
    .sort((a, b) => score(b) - score(a) || a.rank - b.rank || haversine(guess, a) - haversine(guess, b))[0];
  return loose ?? null;
}

export async function snapStopsToRealPlaces(
  maps: MapProvider,
  stops: Stop[],
  near: { lat: number; lng: number },
): Promise<SnapResult> {
  // The walk's area: wide enough to reach every stop the model named even if
  // its guess is off, never the whole country.
  const farthestKm = Math.max(0, ...stops.map((s) => haversine(near, s) / 1000));
  const radiusKm = Math.min(MAX_SEARCH_KM, Math.max(MIN_SEARCH_KM, farthestKm + SEARCH_MARGIN_KM));
  const area = { lat: near.lat, lng: near.lng, radiusKm };

  const placeOne = async (stop: Stop): Promise<Placed> => {
      // The local name first: it is what the map data is indexed by.
      const names = [...new Set([stop.localName, stop.name].filter((q): q is string => !!q?.trim()))];
      const map = (await Promise.all(names.map((q) => fromMap(maps, q, area).catch(() => [])))).flat();
      const score = (c: Candidate) => Math.max(...names.map((n) => nameSimilarity(n, c.name)));
      // Wikipedia only when the map has no exact name, or to vouch for a long move.
      const exact = map.filter((c) => score(c) >= STRONG);
      const needWiki = exact.length === 0 || exact.every((c) => haversine(stop, c) > MAX_LOOSE_CORRECTION_M);
      const wiki = needWiki
        ? (await Promise.all(names.map((q) => fromWikipedia(q, area).catch(() => [])))).flat()
        : [];
      return choose(stop, names, map, wiki);
  };
  const placed: Placed[] = [];
  for (let i = 0; i < stops.length; i += AT_ONCE) {
    placed.push(...(await Promise.all(stops.slice(i, i + AT_ONCE).map(placeOne))));
  }

  // Dropping what could not be placed, but never so much that the walk falls apart.
  const placedCount = placed.filter(Boolean).length;
  const canDrop = placedCount >= Math.max(3, Math.ceil(stops.length / 2));

  let corrected = 0;
  const unmatched: string[] = [];
  const dropped: string[] = [];
  const out: Stop[] = [];
  stops.forEach((stop, i) => {
    const p = placed[i];
    if (p) {
      if (haversine(stop, p) > 5) corrected++;
      out.push({ ...stop, lat: p.lat, lng: p.lng });
    } else if (canDrop) {
      dropped.push(stop.localName ?? stop.name);
    } else {
      unmatched.push(stop.localName ?? stop.name);
      out.push(stop);
    }
  });

  return { stops: out, corrected, unmatched, dropped };
}
