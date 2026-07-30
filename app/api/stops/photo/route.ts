/**
 * A photograph for one stop.
 *
 * Server-side because Wikipedia wants a real User-Agent on it, and because the
 * answer is worth keeping: the same walk asked for the same picture every time
 * a walker returned to a stop.
 *
 * A miss is cached too. Plenty of stops have no article and no photograph, and
 * without remembering that, every visit to a courtyard costs two requests to
 * be told so again.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { findStopPhoto, type StopPhoto } from "@/lib/providers/photos/wikimedia";

export const dynamic = "force-dynamic";

const CACHE = new Map<string, StopPhoto | null>();
const MAX_ENTRIES = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return Response.json({ error: "A stop name is required." }, { status: 400 });

  const localName = url.searchParams.get("localName")?.trim() || undefined;
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const lang = normaliseLang(url.searchParams.get("lang"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "Coordinates are required." }, { status: 400 });
  }

  const key = [lang, localName ?? name, lat.toFixed(4), lng.toFixed(4)].join("|");
  if (CACHE.has(key)) return Response.json({ photo: CACHE.get(key) });

  const photo = await findStopPhoto({ name, localName, lat, lng, lang });
  CACHE.set(key, photo);
  while (CACHE.size > MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  return Response.json({ photo });
}
