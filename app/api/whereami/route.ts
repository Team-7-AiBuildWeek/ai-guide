/**
 * Which city the visitor is in, from their connection — for offering a sample
 * walk of it when the phone's location is refused or unavailable. The app asks
 * for location first and only falls back to this.
 *
 * The place they are in, from the connection (Vercel's x-vercel-ip-* headers,
 * or the place at its coordinates). When that is a village or a small town,
 * the nearest big city instead (40,000 people or more, within 80 km, from a
 * GeoNames list): close enough to be theirs, big enough for a walk. Never a
 * capital on the far side of the country. If the size cannot be checked, the
 * place itself. Nothing is kept. With no place at all, null: the app asks.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { City, Place } from "@/lib/providers/types";
import BIG_CITIES from "@/lib/tour/bigCities.json";
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
      const places = await maps.geocode(ipCity, { kind: "city", lang, ...(near ? { focus: near } : {}) }).catch(() => []);
      const place = near ? places.find((p) => distanceMeters(p, near) < SAME_AREA_M) : places[0];
      if (place) here = toCity(place);
    }
    if (!here && near) {
      const place = await maps.reverseGeocode(near.lat, near.lng, { kind: "city", lang }).catch(() => null);
      if (place && place.name !== "Dropped pin") here = toCity(place);
    }
    // The map knows no place there by that name: the coordinates alone still
    // say which big city is near.
    const probe = here ?? (near ? { name: ipCity ?? "", label: "", ...near } : null);
    if (!probe) return Response.json({ city: null });

    // Big enough itself: that place (named from the list when the map had no
    // name for it); otherwise the nearest big city.
    const bigger = here && !nearestBigCity(probe, ipCity ?? probe.name) ? null : listedOrNearest(probe, ipCity ?? probe.name);
    if (bigger) {
      const places = await maps.geocode(bigger, { kind: "city", lang, focus: { lat: probe.lat, lng: probe.lng } }).catch(() => []);
      const place = places.find((p) => distanceMeters(p, probe) < BIG_CITY_WITHIN_M);
      const nearby = probe.name && probe.name !== bigger ? probe.name : undefined;
      if (place) return Response.json({ city: toCity(place), near: nearby });
      // The map has no such city: the list's own name and centre will do.
      const listed = CITIES.find((c) => c[0] === bigger && distanceMeters(probe, { lat: c[1], lng: c[2] }) < BIG_CITY_WITHIN_M);
      if (listed) return Response.json({ city: { name: listed[0], label: listed[0], lat: listed[1], lng: listed[2] }, near: nearby });
    }
    return Response.json({ city: here });
  } catch {
    return Response.json({ city: null });
  }
}

/** How far the connection's coordinates may be from the place it names. */
const SAME_AREA_M = 30_000;

/** Enough people for a walk of "the city" to have famous sights. */
const BIG_CITY_WITHIN_M = 80_000;
/** Within this of the place the connection names, a listed city is that place. */
const IS_HERE_M = 15_000;

/**
 * Every place of 40,000 people or more: [name, lat, lng, population, country],
 * from GeoNames' cities15000 (CC BY 4.0, geonames.org), filtered once. A fixed
 * list rather than a live lookup: OpenStreetMap and Wikidata answer servers
 * too slowly to wait on before a pop-up.
 */
type BigCity = [string, number, number, number, string];
const CITIES = BIG_CITIES as BigCity[];

/**
 * When `here` is small, the name of the nearest big city — in the same
 * country when there is one near, a border is a long way in practice — or
 * null when `here` is big itself or nothing big is near.
 */
/** The listed city that is this place, or the nearest big one. */
function listedOrNearest(here: City, name: string): string | null {
  return nearestBigCity(here, name, true);
}

function nearestBigCity(here: City, name: string, includeHere = false): string | null {
  const at = { lat: here.lat, lng: here.lng };
  const near = CITIES.map((c) => ({ c, d: distanceMeters(at, { lat: c[1], lng: c[2] }) }))
    .filter((x) => x.d < BIG_CITY_WITHIN_M)
    .sort((a, b) => a.d - b.d);
  const folded = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const self = near.find((x) => x.d < IS_HERE_M && folded(x.c[0]) === folded(name));
  if (self) return includeHere ? self.c[0] : null;
  if (near.length === 0) return null;
  // The country is the one most of the nearby cities are in.
  const country = near[0].c[4];
  const pick = near.find((x) => x.c[4] === country && x.d < IS_HERE_M) ?? near.find((x) => x.c[4] === country) ?? near[0];
  return pick.c[0];
}
