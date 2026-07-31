/**
 * A photograph of the thing the walker is standing in front of.
 *
 * Wikimedia, and deliberately not Google Places: their terms forbid both
 * generating content from Maps data and reading it aloud, which is the whole
 * app. Wikimedia's images are freely licensed, and the page they came from
 * goes on screen with them — that link is the credit.
 *
 * The hard part is not finding *a* picture. It is refusing the wrong one.
 * Three things went wrong often enough to be worth naming, because each one
 * put a confident photograph of somewhere else on screen:
 *
 *  1. The nearest article to a main square is usually the article about the
 *     *city*. Measured at Hlavné námestie: "Bratislava" sits 1.9 m away and
 *     won, so the stop was illustrated with a cityscape. Second place was an
 *     article about a shooting in 1919.
 *  2. An exact title match does not mean the right place. "Main Square" is a
 *     title in a hundred towns, and nothing checked that the article we found
 *     was anywhere near the walker.
 *  3. A stop's local name only exists on the *local* wiki. "Michalská brána"
 *     has a Slovak article with a photograph of the gate and is missing from
 *     the Japanese, Korean and English ones — so every non-Slovak walk fell
 *     through to the proximity search and its city articles.
 *
 * So: every candidate must carry coordinates, and they must be near the stop;
 * anything found by proximity must also prove it is not a settlement or a
 * list; and names are looked for across wikis and by full-text search rather
 * than by exact title alone, which is how "Michalská brána" reaches
 * "Michael's Gate".
 *
 * Server-side only: it is cached per process, and Wikipedia asks for a real
 * User-Agent, which a browser will not let us set.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { distanceMeters } from "@/lib/tour/route";

export type StopPhoto = {
  url: string;
  width: number;
  height: number;
  /** The article the picture belongs to, and where the credit points. */
  title: string;
  page: string;
};

/** Wikipedia asks that tools identify themselves and give a contact. */
const AGENT = "walk-audio-tours/1.0 (https://github.com/Team-7-AiBuildWeek/ai-guide)";

/** Wide enough for a phone at 2×, small enough not to cost a walk its data. */
const THUMB_PX = 800;

/**
 * How far from a stop a photographed article may be and still be that stop.
 *
 * Two figures, because the two ways of finding one carry different evidence.
 * An article found by *name* has already said it is this place, so the
 * distance is only there to catch the same name in another town — generous,
 * since a cathedral's coordinate is its centre and the walker is at a door.
 * An article found by *proximity* has said nothing at all, so it has to be
 * genuinely on top of the stop.
 */
const NAMED_NEAR_M = 500;
const NEAR_M = 250;

/**
 * What a stop is never a picture of.
 *
 * Population is the discriminator rather than a list of types: cities, towns,
 * villages and quarters all carry P1082 and no gate, palace, square, bridge
 * or church does. A list of specific type ids was tried first and does not
 * survive contact with other countries — Vienna is an instance of ten things
 * and "city" is not among them.
 */
const POPULATION = "P1082";
const INSTANCE_OF = "P31";
/** Lists and disambiguation pages have no population and are not places. */
const NOT_A_PLACE = new Set(["Q13406463", "Q4167410"]);

type Thumb = { source: string; width: number; height: number };

type Page = {
  pageid?: number;
  title?: string;
  thumbnail?: Thumb;
  coordinates?: { lat: number; lon: number }[];
  pageprops?: { wikibase_item?: string };
  missing?: string;
};

type Body = {
  query?: {
    pages?: Record<string, Page>;
    search?: { title: string }[];
    geosearch?: { pageid: number; title: string; dist: number }[];
  };
};

async function wiki(host: string, params: Record<string, string>): Promise<Body | null> {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ format: "json", ...params })) {
    url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url, {
      headers: { "user-agent": AGENT, accept: "application/json" },
      // Wikipedia is a good citizen to cache against: an article's lead image
      // changes on the order of years.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Body;
  } catch {
    return null;
  }
}

type Candidate = {
  lang: string;
  title: string;
  thumb: Thumb;
  qid?: string;
  /** Metres from the stop. */
  dist: number;
};

/**
 * Look up a batch of titles and keep only the ones that are photographed and
 * in the right place.
 *
 * One call for the lot. `pilimit` and `colimit` are set to max because their
 * default is one — which is the quiet reason a five-title query used to come
 * back with a single thumbnail on an arbitrary page, and why the nearest-first
 * ordering of a proximity search was thrown away before anything read it.
 */
async function resolve(
  lang: string,
  titles: string[],
  at: { lat: number; lng: number },
  within: number,
): Promise<Candidate[]> {
  const unique = [...new Set(titles.filter(Boolean))].slice(0, 40);
  if (unique.length === 0) return [];

  const body = await wiki(`${lang}.wikipedia.org`, {
    action: "query",
    prop: "pageimages|coordinates|pageprops",
    piprop: "thumbnail",
    pithumbsize: String(THUMB_PX),
    pilimit: "max",
    colimit: "max",
    ppprop: "wikibase_item",
    titles: unique.join("|"),
    redirects: "1",
  });

  const out: Candidate[] = [];
  for (const page of Object.values(body?.query?.pages ?? {})) {
    if (page.missing !== undefined || !page.title || !page.thumbnail) continue;
    const co = page.coordinates?.[0];
    // No coordinates means no way to tell whether this is the right place, and
    // an unverifiable picture is the thing this file exists to refuse.
    if (!co) continue;
    const dist = distanceMeters(at, { lat: co.lat, lng: co.lon });
    if (dist > within) continue;
    out.push({
      lang,
      title: page.title,
      thumb: page.thumbnail,
      qid: page.pageprops?.wikibase_item,
      dist,
    });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/**
 * Drop anything that is a settlement, a list or a disambiguation page.
 *
 * One call for every candidate at once. Only used on candidates found by
 * proximity: an article found because it is *called* what the stop is called
 * has already accounted for itself.
 */
async function dropNonPlaces(candidates: Candidate[]): Promise<Candidate[]> {
  const ids = [...new Set(candidates.map((c) => c.qid).filter(Boolean))] as string[];
  if (ids.length === 0) return candidates;

  const url = new URL("https://www.wikidata.org/w/api.php");
  for (const [k, v] of Object.entries({
    format: "json",
    action: "wbgetentities",
    ids: ids.slice(0, 50).join("|"),
    props: "claims",
  })) {
    url.searchParams.set(k, v);
  }

  let entities: Record<string, { claims?: Record<string, unknown[]> }> = {};
  try {
    const res = await fetch(url, {
      headers: { "user-agent": AGENT, accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return candidates;
    entities = ((await res.json()) as { entities?: typeof entities }).entities ?? {};
  } catch {
    // Wikidata being unreachable is not a reason to show no picture at all.
    return candidates;
  }

  return candidates.filter((c) => {
    if (!c.qid) return true;
    const claims = entities[c.qid]?.claims;
    if (!claims) return true;
    if (claims[POPULATION]) return false;
    const kinds = (claims[INSTANCE_OF] ?? []) as {
      mainsnak?: { datavalue?: { value?: { id?: string } } };
    }[];
    return !kinds.some((k) => {
      const id = k.mainsnak?.datavalue?.value?.id;
      return id ? NOT_A_PLACE.has(id) : false;
    });
  });
}

function toPhoto(c: Candidate): StopPhoto {
  return {
    url: c.thumb.source,
    width: c.thumb.width,
    height: c.thumb.height,
    title: c.title,
    page: `https://${c.lang}.wikipedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, "_"))}`,
  };
}

/** Titles that full-text search thinks match this name. */
async function search(lang: string, term: string): Promise<string[]> {
  const body = await wiki(`${lang}.wikipedia.org`, {
    action: "query",
    list: "search",
    srsearch: term,
    srlimit: "3",
  });
  return (body?.query?.search ?? []).map((s) => s.title);
}

/**
 * The best photograph for one stop, or null when there honestly is not one.
 *
 * Null is a normal answer. A courtyard, a street corner and a view have no
 * article between them, and a made-up picture of somewhere else is worse than
 * a stop with no picture.
 *
 * Three passes, cheapest and most certain first, each returning the moment it
 * has something it can stand behind.
 */
export async function findStopPhoto(stop: {
  name: string;
  localName?: string;
  lat: number;
  lng: number;
  lang: string;
}): Promise<StopPhoto | null> {
  const lang = normaliseLang(stop.lang);
  const at = { lat: stop.lat, lng: stop.lng };
  const names = [stop.localName, stop.name].filter(Boolean) as string[];
  /**
   * The walker's own language first, so the credit link is one they can read.
   * English second, because it is where a local name most often finds its
   * article when the walker's language has none — and where "Michalská brána"
   * turns into "Michael's Gate".
   */
  const wikis = [...new Set([lang, "en"])];

  // 1. The name, as a title, on each wiki. One call apiece and it is the
  //    answer most of the time.
  for (const w of wikis) {
    const hit = (await resolve(w, names, at, NAMED_NEAR_M))[0];
    if (hit) return toPhoto(hit);
  }

  // 2. The name, as something to search for. This is the pass that crosses
  //    languages, and the reason a Japanese walk gets a picture of the gate.
  for (const w of wikis) {
    const found = (await Promise.all(names.map((n) => search(w, n)))).flat();
    const hit = (await resolve(w, found, at, NAMED_NEAR_M))[0];
    if (hit) return toPhoto(hit);
  }

  // 3. Whatever is standing here. Nothing in this pass has claimed to be the
  //    stop, so it is held to the tighter distance and has to prove it is a
  //    place rather than a city or a list.
  for (const w of wikis) {
    const near = await wiki(`${w}.wikipedia.org`, {
      action: "query",
      list: "geosearch",
      gscoord: `${stop.lat}|${stop.lng}`,
      gsradius: String(NEAR_M),
      gslimit: "10",
    });
    const titles = (near?.query?.geosearch ?? []).map((g) => g.title);
    if (titles.length === 0) continue;
    const hit = (await dropNonPlaces(await resolve(w, titles, at, NEAR_M)))[0];
    if (hit) return toPhoto(hit);
  }

  return null;
}
