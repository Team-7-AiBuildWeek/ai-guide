/**
 * A sample walk of a city (lib/tour/sample.ts): ready at once when one has
 * been built, otherwise built now — about a minute, once per city and
 * language, then instant for everyone.
 *
 * Free and open, like the demo: no sign-in, not a walk from anyone's
 * allowance. Only building is rate-limited (it is the one paid call).
 *
 * GET ?name=Vienna&label=Vienna, Austria&lat=48.2&lng=16.37&lang=en
 *     &check=1 — only say whether it is ready, never build.
 */

import { normaliseLang } from "@/lib/i18n/languages";
import type { City } from "@/lib/providers/types";
import { spend } from "@/lib/rateLimit";
import { sampleFor, sampleKey } from "@/lib/tour/sample";
import { loadSample } from "@/lib/tour/saved";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const name = p.get("name")?.trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "A city is required." }, { status: 400 });
  }
  const city: City = { name, label: p.get("label")?.trim() || name, lat, lng };
  const lang = normaliseLang(p.get("lang") ?? "en");

  if (p.get("check")) {
    const kept = await loadSample(sampleKey(city, lang)).catch(() => null);
    return Response.json({ ready: !!kept, tour: kept });
  }
  try {
    // Rate-limited where it is public; a local server pre-builds freely.
    const beforeBuild = process.env.NODE_ENV === "production" ? () => spend(request.headers, "tour") : undefined;
    const tour = await sampleFor(city, lang, { beforeBuild });
    return Response.json({ tour });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "The sample walk could not be made." },
      { status: 502 },
    );
  }
}
