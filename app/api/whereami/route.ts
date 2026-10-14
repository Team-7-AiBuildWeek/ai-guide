/**
 * Which city the visitor is in, from their connection — for offering a sample
 * walk when the phone's location is refused or unavailable. The app asks for
 * location first and only falls back to this.
 *
 * Vercel puts the request's approximate place in headers (x-vercel-ip-*), so
 * the address is never sent anywhere and nothing is kept. The answer is the
 * place the connection is in, however small; only when it names none, the
 * nearest city of 100,000 people or more (OpenStreetMap), then the country's
 * capital. Checked against the map so it comes back with its centre.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { City, Place } from "@/lib/providers/types";
import { overpass } from "@/lib/providers/transit/osm";
import { CAPITALS } from "@/lib/tour/capitals";
import { distanceMeters } from "@/lib/tour/route";

export const dynamic = "force-dynamic";

function header(request: Request, name: string): string | null {
  const v = request.headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** "Vienna" + its address → "Vienna, Austria", as lib/tour/city.ts labels a city. */
function toCity(place: Place): City {
  const rest = place.address
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== place.name);
  const country = rest.length > 0 ? rest[rest.length - 1] : "";
  return { name: place.name, label: country ? `${place.name}, ${country}` : place.name, lat: place.lat, lng: place.lng };
}

export async function GET(request: Request) {
  const lang = normaliseLang(new URL(request.url).searchParams.get("lang") ?? "en");
  const country = header(request, "x-vercel-ip-country")?.toUpperCase() ?? null;
  const ipCity = header(request, "x-vercel-ip-city");
  const lat = Number(header(request, "x-vercel-ip-latitude"));
  const lng = Number(header(request, "x-vercel-ip-longitude"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;

  // The place you are in, however small: a walk of somewhere you know is the
  // point, and the capital can be the far side of the country. Only with no
  // place at all, the nearest big city, then the capital.
  const big = !ipCity && near ? await bigCityNear(near, lang) : null;
  const name = ipCity ?? big ?? (country ? CAPITALS[country] : null);
  if (!name) return Response.json({ city: null });

  try {
    const [place] = await getMaps().geocode(name, {
      kind: "city",
      lang,
      // The coordinates steer the lookup to the right Springfield; for a
      // capital, the country's capital is unambiguous.
      ...((ipCity || big) && near ? { focus: near } : {}),
    });
    if (place) {
      return Response.json({ city: toCity(place), from: ipCity ? "ip-city" : big ? "nearby-city" : "capital" });
    }
  } catch {
    // fall through
  }
  return Response.json({ city: null });
}

/** People enough for a walk of "the city" to mean something. */
const BIG_CITY = 100_000;
const BIG_CITY_WITHIN_M = 40_000;

/**
 * The nearest city of BIG_CITY people or more (OpenStreetMap's place=city
 * with a population), or null. A few seconds at most: past that, the capital.
 */
async function bigCityNear(at: { lat: number; lng: number }, lang: string): Promise<string | null> {
  const q =
    `[out:json][timeout:4];node["place"="city"]["population"]` +
    `(around:${BIG_CITY_WITHIN_M},${at.lat.toFixed(2)},${at.lng.toFixed(2)});out tags center 40;`;
  const els = ((await overpass(q, 5000)) ?? []) as { lat?: number; lon?: number; tags?: Record<string, string> }[];
  const cities = els
    .map((e) => ({
      name: e.tags?.[`name:${lang}`] ?? e.tags?.["name:en"] ?? e.tags?.name,
      people: Number((e.tags?.population ?? "").replace(/[^\d]/g, "")),
      d: typeof e.lat === "number" && typeof e.lon === "number" ? distanceMeters(at, { lat: e.lat, lng: e.lon }) : Infinity,
    }))
    .filter((c) => c.name && c.people >= BIG_CITY)
    .sort((a, b) => a.d - b.d);
  return cities[0]?.name ?? null;
}
