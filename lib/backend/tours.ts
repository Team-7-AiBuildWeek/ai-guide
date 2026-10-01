/**
 * Turning a walker's brief into a walk-backend tour, and back into this app's
 * own TourPlan, so the rest of the app cannot tell where a stop came from.
 *
 * What the backend serves: a city it has seeded, in a language it narrates,
 * from the structured settings. A free-text brief stays live on purpose — the
 * walker's own words are meant to shape the narration, and shared recordings
 * cannot be shaped per walker. Everything the backend cannot serve, and every
 * way it can fail, returns null and the tour is written live as before.
 */

import type { Detail, Interest, Stop, TourPlan, TourRequest } from "@/lib/providers/types";
import {
  BackendError,
  backendBundle,
  backendCityAt,
  backendEnabled,
  backendMeta,
  requestBackendTour,
  type BackendBundle,
  type BackendStop,
} from "./client";

/** Which backend theme an interest belongs to. Interests not listed choose the
 *  city's highlights rather than a theme that would fit them badly. */
const THEME_OF: Partial<Record<Interest, string>> = {
  history: "history",
  royal: "history",
  conflict: "history",
  legends: "history",
  architecture: "architecture",
  sacred: "architecture",
  art: "art",
  music: "art",
  literature: "art",
  food: "food",
};

const DEPTH_OF: Record<Detail, string> = {
  highlights: "short",
  story: "full",
  everything: "full",
};

/**
 * Themes to try, best match first, always ending with the city's highlights.
 * A city may have nothing for a theme — no food stops seeded, say — and a walker
 * who asked for food and history should get history, not a live-written tour.
 */
export function themesFor(interests: Interest[], available: string[]): string[] {
  const themes = interests.map((i) => THEME_OF[i]).filter((t): t is string => !!t && available.includes(t));
  return [...new Set([...themes, "highlights"])];
}

export type BackendPlan = {
  plan: TourPlan;
  tourId: number;
  status: "pending" | "ready" | "failed";
  hits: number;
  total: number;
};

/** The URL this app plays a recording from. Stable, unlike the signed link behind it. */
export function narrationSrc(audioId: string): string {
  return `/api/narration/${encodeURIComponent(audioId)}`;
}

function firstSentence(text: string | null): string {
  if (!text) return "";
  const match = text.match(/^[\s\S]*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim().slice(0, 200);
}

export function stopFromBackend(s: BackendStop, tourId: number, lang: string): Stop {
  return {
    id: `b${s.poi_id}`,
    // Slovak walkers read the Slovak name; everyone else the English one, with
    // the local name kept alongside for the map and the photo lookup.
    name: lang === "sk" && s.local_name ? s.local_name : s.name,
    localName: s.local_name ?? undefined,
    lat: s.lat,
    lng: s.lng,
    angle: firstSentence(s.transcript),
    script: s.transcript ?? undefined,
    audio: s.audio ? { src: narrationSrc(s.audio.id), durationMs: s.audio.duration_ms } : undefined,
    backend: { tourId, position: s.position },
  };
}

export function planFromBundle(bundle: BackendBundle, cityName: string, lang: string): TourPlan {
  const stops = bundle.stops.map((s) => stopFromBackend(s, bundle.tour.id, lang));
  return {
    title: cityName,
    summary: stops.map((s) => s.name).join(" · "),
    stops,
  };
}

/**
 * The tour from walk-backend, or null when this brief is not one it serves or
 * it could not be reached. Never throws.
 */
export async function backendPlanFor(req: TourRequest): Promise<BackendPlan | null> {
  if (!backendEnabled() || req.freeText?.trim()) return null;
  try {
    const meta = await backendMeta();
    if (!meta.languages.includes(req.lang)) return null;
    const city = await backendCityAt(req.start.lat, req.start.lng);
    if (!city) return null;

    let tour: Awaited<ReturnType<typeof requestBackendTour>> | null = null;
    for (const theme of themesFor(req.interests, meta.themes)) {
      try {
        tour = await requestBackendTour({
          city_id: city.id,
          theme,
          language: req.lang,
          persona: "storyteller",
          depth_level: DEPTH_OF[req.detail] ?? "full",
          duration_min: Math.min(meta.duration_min.max, Math.max(meta.duration_min.min, req.durationMinutes)),
          start_lat: req.start.lat,
          start_lng: req.start.lng,
        });
        break;
      } catch (err) {
        // 422: nothing in this theme fits here. Try the next one.
        if (!(err instanceof BackendError && err.status === 422)) throw err;
      }
    }
    if (!tour || tour.status === "failed") return null;
    const bundle = await backendBundle(tour.tour_id);
    return {
      plan: planFromBundle(bundle, city.name, req.lang),
      tourId: tour.tour_id,
      status: bundle.status,
      hits: tour.cache.segments_hit,
      total: tour.cache.segments_total,
    };
  } catch (err) {
    // 429 (generation budget spent), 422 (nothing fits the time), unreachable:
    // all of them mean the same thing to the walker — a live tour instead.
    if (!(err instanceof BackendError)) console.warn("[backend] unexpected error", err);
    else console.info(`[backend] falling back to live: ${err.status} ${err.message}`);
    return null;
  }
}

/**
 * One stop's recording, waiting a little for it if the backend is still making
 * it. Null when it is not ready in time — the caller writes that stop live.
 */
export async function backendStopWhenReady(
  ref: { tourId: number; position: number },
  lang: string,
  waitMs: number,
): Promise<Stop | null> {
  if (!backendEnabled()) return null;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const bundle = await backendBundle(ref.tourId);
      const stop = bundle.stops.find((s) => s.position === ref.position);
      if (stop?.audio && stop.transcript) return stopFromBackend(stop, ref.tourId, lang);
      if (bundle.status === "failed") return null;
    } catch {
      return null;
    }
    if (Date.now() + 1500 > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
