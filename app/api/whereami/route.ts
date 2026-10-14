/**
 * Which city the visitor is in, from their connection — for offering a sample
 * walk of it when the phone's location is refused or unavailable. The app asks
 * for location first and only falls back to this.
 *
 * Always the place they are in, however small: a walk of somewhere they know
 * is the point, and any other city may be the far side of the country. The
 * connection's own place name (Vercel's x-vercel-ip-* headers) when it gives
 * one, otherwise whatever place is at its coordinates. Nothing is sent to a
 * third party and nothing is kept. With no place at all, null: the app asks.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { City, Place } from "@/lib/providers/types";

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
    if (ipCity) {
      // The coordinates steer the lookup to the right Springfield.
      const [place] = await maps.geocode(ipCity, { kind: "city", lang, ...(near ? { focus: near } : {}) });
      if (place) return Response.json({ city: toCity(place) });
    }
    if (near) {
      const place = await maps.reverseGeocode(near.lat, near.lng, { kind: "city", lang });
      if (place && place.name !== "Dropped pin") return Response.json({ city: toCity(place) });
    }
  } catch {
    // fall through: the app asks for a city
  }
  return Response.json({ city: null });
}
