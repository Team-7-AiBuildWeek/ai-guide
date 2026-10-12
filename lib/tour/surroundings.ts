/**
 * What is around the walker, for "what am I looking at?".
 *
 * A model handed a pair of coordinates guesses: it knows roughly what is in
 * Asakusa, not which of the gate, the shop or the temple is twenty metres in
 * front of this phone. So the question is answered from the map instead — the
 * named places within reach of the fix, each with how far away it is and which
 * way it lies from the way the phone is pointing — and the model reasons over
 * that list rather than over its memory of the neighbourhood.
 *
 * Two sources, asked at once, each given a few seconds:
 *  - Wikipedia's geosearch, for landmarks. Fast and dependable, and anything
 *    with an article is a likely answer to "what is that".
 *  - OpenStreetMap through Overpass, for the small things a walker actually
 *    stands in front of: a gate, a statue, a named shop. Overpass is often
 *    slow or down (all three mirrors failed on the day this was written), so
 *    it adds to Wikipedia rather than being relied on.
 *
 * Never Google Maps — see lib/providers/maps/index.ts for why.
 *
 * Server-only.
 */

import { haversine } from "@/lib/providers/maps";
import { overpass } from "@/lib/providers/transit/osm";

export type Surroundings = {
  /** Lines to hand the model, likeliest first. */
  lines: string[];
  /** How far out the search went, in metres. */
  radius: number;
};

/** Something with a name and a position, from either source. */
type Candidate = {
  name: string;
  /** What is written on the sign, when the walker's language names it differently. */
  local?: string;
  kind: string;
  lat: number;
  lng: number;
  /** Has an encyclopedia article: a landmark rather than a shop. */
  notable: boolean;
  /** Extra weight from what it is (a temple over a café). */
  weight: number;
};

type OsmElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** How many places the model is given. Enough to choose from, few enough to read. */
const MAX_PLACES = 14;

/**
 * How long each source may take, before the model starts on its own. A walker
 * waiting in the street will not wait longer. Wikipedia answers in about half
 * a second; Overpass, when it answers at all, is the slow one, so it gets less
 * — its places are the extras, not the answer.
 */
const WIKI_BUDGET_MS = 4_000;
const OSM_BUDGET_MS = 2_500;

const AGENT = "walk-audio-tours/1.0 (https://github.com/Team-7-AiBuildWeek/ai-guide)";

/** Search radius: the fix's own uncertainty plus what can be seen from a street. */
function radiusFor(accuracy: number | undefined): number {
  const acc = typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : 50;
  return Math.round(Math.min(400, Math.max(120, acc + 100)));
}

/** Degrees clockwise from north, from the walker to the place. */
function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Where a place lies, in the words someone standing there would use. */
function direction(to: number, rel: number | null): string {
  if (rel === null) return `to the ${COMPASS[Math.round(to / 45) % 8]}`;
  const a = Math.abs(rel);
  if (a <= 25) return "straight ahead";
  if (a <= 65) return rel < 0 ? "ahead to the left" : "ahead to the right";
  if (a <= 115) return rel < 0 ? "to the left" : "to the right";
  if (a <= 155) return rel < 0 ? "behind to the left" : "behind to the right";
  return "behind";
}

/** Resolves to null instead of waiting past the budget. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

// --------------------------------------------------------------- wikipedia

type GeoHit = { title: string; lat: number; lon: number; type?: string | null };

async function wikipediaNear(lat: number, lng: number, radius: number, wiki: string): Promise<GeoHit[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lng}`,
    gsradius: String(Math.min(10_000, radius)),
    gslimit: "20",
    gsprop: "type",
    format: "json",
  });
  const res = await fetch(`https://${wiki}.wikipedia.org/w/api.php?${params}`, {
    headers: { "user-agent": AGENT },
    signal: AbortSignal.timeout(WIKI_BUDGET_MS),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { query?: { geosearch?: GeoHit[] } };
  return body.query?.geosearch ?? [];
}

const WIKI_KIND: Record<string, string> = {
  landmark: "landmark",
  railwaystation: "station",
  edu: "school or university",
  river: "river",
  waterbody: "water",
  mountain: "hill",
  city: "district",
  adm1st: "district",
  adm2nd: "district",
  adm3rd: "district",
  airport: "airport",
};

async function fromWikipedia(lat: number, lng: number, radius: number, lang: string): Promise<Candidate[]> {
  // The walker's own Wikipedia first, for names in their language; English
  // as well where the local one is thin, because it covers more of the world.
  const wikis = lang === "en" ? ["en"] : [lang, "en"];
  const lists = await Promise.all(wikis.map((w) => wikipediaNear(lat, lng, radius, w).catch(() => [])));
  return lists.flat().map((h) => ({
    name: h.title.replace(/\s*\([^)]*\)$/, ""),
    kind: (h.type && WIKI_KIND[h.type]) || "place with a Wikipedia article",
    lat: h.lat,
    lng: h.lon,
    notable: true,
    weight: h.type === "landmark" ? 1 : 0,
  }));
}

// -------------------------------------------------------- openstreetmap

/** What kind of thing it is, from its tags, in a few words. */
function osmKind(tags: Record<string, string>): string {
  const pick =
    tags.historic ??
    tags.tourism ??
    tags.amenity ??
    tags.leisure ??
    tags.man_made ??
    tags.shop ??
    tags.natural ??
    tags.railway ??
    (tags.building && tags.building !== "yes" ? tags.building : tags.building ? "building" : undefined);
  const base = (pick ?? "place").replace(/_/g, " ");
  return tags.religion ? `${base}, ${tags.religion}` : base;
}

function osmWeight(tags: Record<string, string>): number {
  let w = 0;
  if (tags.historic || tags.tourism === "attraction" || tags.tourism === "museum") w += 2;
  if (tags.amenity === "place_of_worship" || tags.building === "temple" || tags.building === "church") w += 2;
  if (tags.shop || tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "bar") w -= 1;
  return w;
}

async function fromOsm(lat: number, lng: number, radius: number, lang: string): Promise<Candidate[]> {
  // Rounded so two questions from the same spot share a cached answer; the
  // distances are still measured from the exact fix.
  const around = `(around:${radius + 15},${lat.toFixed(4)},${lng.toFixed(4)})`;
  const q =
    `[out:json][timeout:3];(` +
    `nwr["name"]["historic"]${around};` +
    `nwr["name"]["tourism"]${around};` +
    `nwr["name"]["amenity"~"place_of_worship|theatre|museum|library|townhall|fountain|arts_centre|university|marketplace|restaurant|cafe|bar"]${around};` +
    `nwr["name"]["leisure"~"park|garden"]${around};` +
    `nwr["name"]["man_made"]${around};` +
    `nwr["name"]["building"]${around};` +
    `nwr["name"]["shop"]${around};` +
    `);out center tags 120;`;
  const els = ((await overpass(q, OSM_BUDGET_MS)) ?? []) as OsmElement[];
  return els.flatMap((e) => {
    const tags = e.tags ?? {};
    const at = e.center ?? (typeof e.lat === "number" && typeof e.lon === "number" ? { lat: e.lat, lon: e.lon } : null);
    const name = tags[`name:${lang}`] ?? tags.name;
    if (!at || !name) return [];
    return [
      {
        name,
        local: tags.name && tags.name !== name ? tags.name : undefined,
        kind: osmKind(tags),
        lat: at.lat,
        lng: at.lon,
        notable: !!(tags.wikipedia || tags.wikidata),
        weight: osmWeight(tags),
      },
    ];
  });
}

// ------------------------------------------------------------------ both

/**
 * The named places around a position, described from where the walker stands.
 * Null when neither source answered in time — the question is then answered
 * from the stop alone.
 */
export async function surroundings(input: {
  lat: number;
  lng: number;
  accuracy?: number;
  /** Degrees clockwise from north; null when the phone has no compass. */
  heading?: number | null;
  /** Names wanted in this language where the sources have them. */
  lang: string;
}): Promise<Surroundings | null> {
  const radius = radiusFor(input.accuracy);
  const lang = input.lang.split("-")[0];
  const [wiki, osm] = await Promise.all([
    within(fromWikipedia(input.lat, input.lng, radius, lang), WIKI_BUDGET_MS),
    within(fromOsm(input.lat, input.lng, radius, lang), OSM_BUDGET_MS),
  ]);
  if (!wiki && !osm) return null;

  const heading = typeof input.heading === "number" && Number.isFinite(input.heading) ? input.heading : null;
  const seen = new Set<string>();
  const key = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

  const places = [...(wiki ?? []), ...(osm ?? [])]
    .map((c) => {
      const dist = haversine(input, c);
      const to = bearing(input.lat, input.lng, c.lat, c.lng);
      const rel = heading === null ? null : ((to - heading + 540) % 360) - 180;
      // Landmarks over shops, what the walker faces over what is behind
      // them, near over far.
      const score =
        (c.notable ? 3 : 0) +
        c.weight +
        (rel === null ? 0 : Math.abs(rel) <= 45 ? 2 : Math.abs(rel) <= 90 ? 1 : -1) -
        dist / 60;
      return { c, dist, to, rel, score };
    })
    .filter((p) => p.dist <= radius)
    .sort((a, b) => b.score - a.score)
    // The same gate from both sources is one gate; the better-scored copy wins.
    .filter((p) => {
      const k = key(p.c.name);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_PLACES);

  return {
    radius,
    lines: places.map(
      ({ c, dist, to, rel }) =>
        `${c.name}${c.local ? ` (${c.local})` : ""} — ${c.kind}, about ${Math.max(5, Math.round(dist / 5) * 5)} m ${direction(to, rel)}${c.notable ? " [has a Wikipedia article]" : ""}`,
    ),
  };
}
