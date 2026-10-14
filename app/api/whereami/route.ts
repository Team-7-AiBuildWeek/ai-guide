/**
 * Which city the visitor is in, from their connection — for offering a sample
 * walk of it when the phone's location is refused or unavailable. The app asks
 * for location first and only falls back to this.
 *
 * The place they are in, from the connection (Vercel's x-vercel-ip-* headers,
 * or the place at its coordinates). When that is a village or a small town,
 * the nearest big city instead (50,000 people or more, within 80 km, from
 * OpenStreetMap): close enough to be theirs, big enough for a walk. Never a
 * capital on the far side of the country. If the size cannot be checked, the
 * place itself. Nothing is kept. With no place at all, null: the app asks.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { City, Place } from "@/lib/providers/types";
import { overpass } from "@/lib/providers/transit/osm";
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
  const ipCity = header(request, "x-vercel-ip-city");
  const lat = Number(header(request, "x-vercel-ip-latitude"));
  const lng = Number(header(request, "x-vercel-ip-longitude"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
  const maps = getMaps();

  try {
    let here: City | null = null;
    if (ipCity) {
      // The coordinates steer the lookup to the right Springfield, and a
      // namesake far from them (a district called like a village elsewhere)
      // is not where they are.
      const places = await maps.geocode(ipCity, { kind: "city", lang, ...(near ? { focus: near } : {}) });
      const place = near ? places.find((p) => distanceMeters(p, near) < SAME_AREA_M) : places[0];
      if (place) here = toCity(place);
    }
    if (!here && near) {
      const place = await maps.reverseGeocode(near.lat, near.lng, { kind: "city", lang });
      if (place && place.name !== "Dropped pin") here = toCity(place);
    }
    if (!here) return Response.json({ city: null });

    const bigger = await nearestBigCity(here, ipCity ?? here.name, lang);
    if (bigger) {
      const [place] = await maps.geocode(bigger, { kind: "city", lang, focus: { lat: here.lat, lng: here.lng } });
      if (place) return Response.json({ city: toCity(place), near: here.name });
    }
    return Response.json({ city: here });
  } catch {
    return Response.json({ city: null });
  }
}

/** How far the connection's coordinates may be from the place it names. */
const SAME_AREA_M = 30_000;

/** Enough people for a walk of "the city" to have famous sights. */
const BIG_CITY = 50_000;
const BIG_CITY_WITHIN_M = 80_000;

type OsmPlace = { lat?: number; lon?: number; tags?: Record<string, string> };
const people = (p: OsmPlace) => Number((p.tags?.population ?? "").replace(/[^\d]/g, "")) || 0;

/**
 * When `here` is small, the name of the nearest big city; null when `here` is
 * big itself, when none is near, or when OpenStreetMap does not answer in time.
 */
async function nearestBigCity(here: City, name: string, lang: string): Promise<string | null> {
  const at = `${here.lat.toFixed(3)},${here.lng.toFixed(3)}`;
  const q =
    `[out:json][timeout:8];(` +
    `node["place"]["name"="${name.replace(/"/g, "")}"](around:15000,${at});` +
    // 50,000 or more, as a pattern so the server only sends those.
    `node["place"~"^(city|town)$"]["population"~"^([5-9][0-9]{4}|[0-9]{6,})$"](around:${BIG_CITY_WITHIN_M},${at});` +
    `);out 100;`;
  const els = ((await overpass(q, 10_000)) ?? []) as OsmPlace[];
  if (els.length === 0) return null;
  const self = els.find((e) => e.tags?.name === name);
  if (self && (self.tags?.place === "city" || people(self) >= BIG_CITY)) return null;
  const big = els
    .filter((e) => e !== self && people(e) >= BIG_CITY && typeof e.lat === "number" && typeof e.lon === "number")
    .map((e) => ({ e, d: distanceMeters({ lat: here.lat, lng: here.lng }, { lat: e.lat!, lng: e.lon! }) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!big) return null;
  return big.e.tags?.[`name:${lang}`] ?? big.e.tags?.name ?? null;
}
