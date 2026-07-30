"use client";

/**
 * Finding out which city the walk is in.
 *
 * Two ways in, because either can fail: the GPS fix resolved to a name, or a
 * name typed in from an armchair three countries away. Both end at the same
 * `City`, so nothing downstream needs to know which happened.
 */

import type { City, Place } from "@/lib/providers/types";

/** Ask for the walker's language, or let the server answer in English. */
function langParam(lang?: string): string {
  return lang ? `&lang=${encodeURIComponent(lang)}` : "";
}

/** Everything after the city's own name: "Vienna, Austria" → "Austria". */
function qualifier(place: Place): string {
  const rest = place.address
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== place.name);
  // The last part is the country, which is what disambiguates a name. The
  // parts between are districts and postcodes nobody says out loud.
  return rest.length > 0 ? rest[rest.length - 1] : "";
}

function toCity(place: Place): City {
  const extra = qualifier(place);
  return {
    name: place.name,
    label: extra ? `${place.name}, ${extra}` : place.name,
    lat: place.lat,
    lng: place.lng,
  };
}

/** Which city is at these coordinates. Null when nothing recognisable is. */
export async function cityAt(lat: number, lng: number, lang?: string): Promise<City | null> {
  try {
    const res = await fetch(`/api/geocode?kind=city&lat=${lat}&lng=${lng}${langParam(lang)}`);
    const body = (await res.json()) as { places?: Place[] };
    const place = body.places?.[0];
    if (!place || place.name === "Dropped pin") return null;
    return toCity(place);
  } catch {
    return null;
  }
}

/** Cities matching what was typed, anywhere in the world. */
export async function searchCities(query: string, lang?: string): Promise<City[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(`/api/geocode?kind=city&q=${encodeURIComponent(q)}${langParam(lang)}`);
    const body = (await res.json()) as { places?: Place[] };
    const seen = new Set<string>();
    return (body.places ?? [])
      .map(toCity)
      // Administrative layers stack: the same city can arrive three times as a
      // locality, a localadmin and a borough.
      .filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
  } catch {
    return [];
  }
}
