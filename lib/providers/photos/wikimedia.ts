/**
 * A photograph of the thing the walker is standing in front of.
 *
 * Wikimedia, and deliberately not Google Places: their terms forbid both
 * generating content from Maps data and reading it aloud, which is the whole
 * app. Wikimedia's images are freely licensed, and the page they came from
 * goes on screen with them — that link is the credit.
 *
 * Two ways to find one, in order of how well they place it:
 *
 *  1. By name, on the Wikipedia of the *local* language. "Michalská brána" has
 *     a Slovak article with a photograph of the gate; "Michael's Gate" may have
 *     no article at all. The tour already carries that local name because the
 *     map lookups need it.
 *  2. By coordinates, when the name finds nothing — every article within a
 *     couple of hundred metres, nearest first. That is how a stop called
 *     "the courtyard behind the theatre" still gets a picture of the theatre.
 *
 * Server-side only: it is cached per process, and Wikipedia asks for a real
 * User-Agent, which a browser will not let us set.
 */

import { normaliseLang } from "@/lib/i18n/languages";

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

/** How far from a stop a photographed article may be and still be that stop. */
const NEAR_M = 250;

type PageImages = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        thumbnail?: { source: string; width: number; height: number };
        pageimage?: string;
      }
    >;
    geosearch?: { pageid: number; title: string; dist: number }[];
  };
};

async function wikipedia(lang: string, params: Record<string, string>): Promise<PageImages | null> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  for (const [k, v] of Object.entries({ format: "json", origin: "*", ...params })) {
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
    return (await res.json()) as PageImages;
  } catch {
    return null;
  }
}

function firstImage(body: PageImages | null, lang: string): StopPhoto | null {
  const pages = body?.query?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) {
    if (!page.thumbnail?.source || !page.title) continue;
    return {
      url: page.thumbnail.source,
      width: page.thumbnail.width,
      height: page.thumbnail.height,
      title: page.title,
      page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    };
  }
  return null;
}

/**
 * The best photograph for one stop, or null when there honestly is not one.
 *
 * Null is a normal answer. A courtyard, a street corner and a view have no
 * article between them, and a made-up picture of somewhere else is worse than
 * a stop with no picture.
 */
export async function findStopPhoto(stop: {
  name: string;
  localName?: string;
  lat: number;
  lng: number;
  lang: string;
}): Promise<StopPhoto | null> {
  const lang = normaliseLang(stop.lang);
  // The local name is what the place is called where it stands, so it is what
  // the local Wikipedia calls it.
  const names = [stop.localName, stop.name].filter(Boolean) as string[];

  for (const title of names) {
    const byName = firstImage(
      await wikipedia(lang, {
        action: "query",
        prop: "pageimages",
        piprop: "thumbnail",
        pithumbsize: String(THUMB_PX),
        titles: title,
        redirects: "1",
      }),
      lang,
    );
    if (byName) return byName;
  }

  const near = await wikipedia(lang, {
    action: "query",
    list: "geosearch",
    gscoord: `${stop.lat}|${stop.lng}`,
    gsradius: String(NEAR_M),
    gslimit: "5",
  });
  const found = near?.query?.geosearch ?? [];
  if (found.length === 0) return null;

  // Nearest first, which geosearch already sorts by.
  return firstImage(
    await wikipedia(lang, {
      action: "query",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: String(THUMB_PX),
      titles: found.map((f) => f.title).join("|"),
      redirects: "1",
    }),
    lang,
  );
}
