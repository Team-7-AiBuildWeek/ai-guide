/**
 * Which city the visitor is in, from their connection — for offering a sample
 * walk when the phone's location is refused or unavailable. The app asks for
 * location first and only falls back to this.
 *
 * Vercel puts the request's approximate place in headers (x-vercel-ip-*), so
 * nothing is sent anywhere and nothing is kept. The city is checked against
 * the map so it comes back as a proper city with its centre; when the
 * connection gives no city, it is the country's capital.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import { getMaps } from "@/lib/providers/factory";
import type { City, Place } from "@/lib/providers/types";
import { CAPITALS } from "@/lib/tour/capitals";

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

  const name = ipCity ?? (country ? CAPITALS[country] : null);
  if (!name) return Response.json({ city: null });

  try {
    const [place] = await getMaps().geocode(name, {
      kind: "city",
      lang,
      // The connection's own coordinates steer the lookup to the right
      // Springfield; for a capital, the country's capital is unambiguous.
      ...(ipCity && near ? { focus: near } : {}),
    });
    if (place) return Response.json({ city: toCity(place), from: ipCity ? "ip-city" : "capital" });
  } catch {
    // fall through
  }
  return Response.json({ city: null });
}
