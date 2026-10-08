/**
 * Talking to walk-backend. Server-side only: import it from route handlers, never
 * from a component.
 *
 * The browser never sees the backend's address: every call goes through this
 * app's own routes, so the backend's generation endpoints are not open to the
 * internet and its budget caps only ever see this app's traffic.
 *
 * Every call is short and bounded. A slow or missing backend must cost a walker
 * nothing but a live-written tour, which is what this app did before it existed.
 */

import { config } from "@/lib/config";

export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export type BackendCity = {
  id: number;
  slug: string;
  name: string;
  country_code: string;
  centroid: { lat: number; lng: number };
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
};

export type BackendMeta = {
  languages: string[];
  personas: string[];
  depths: string[];
  themes: string[];
  duration_min: { min: number; max: number };
};

export type BackendTourRequest = {
  city_id: number;
  theme: string;
  language: string;
  persona: string;
  depth_level: string;
  duration_min: number;
  start_lat?: number;
  start_lng?: number;
};

export type BackendTourResponse = {
  tour_id: number;
  status: "pending" | "ready" | "failed";
  cache: { segments_total: number; segments_hit: number; hit_ratio: number };
};

export type BackendAudio = {
  url: string;
  duration_ms: number;
  bytes: number;
  content_type: string;
  /** The recording's identity (its audio hash). Stable forever. */
  id: string;
};

export type BackendStop = {
  position: number;
  poi_id: number;
  name: string;
  local_name: string | null;
  lat: number;
  lng: number;
  trigger_radius_m: number;
  audio: BackendAudio | null;
  transcript: string | null;
  sources: { url: string; license: string }[];
};

export type BackendBundle = {
  status: "pending" | "ready" | "failed";
  tour: { id: number; city_id: number; theme: string; language: string };
  stops: BackendStop[];
};

/** A tour walk-backend recorded in advance, as `GET /cities/{id}/tours` lists it. */
export type BackendPremadeTour = {
  id: number;
  theme: string;
  language: string;
  persona: string;
  depth_level: string;
  target_duration_min: number;
  /** How many stops. */
  stops: number;
  total_duration_ms: number | null;
  total_walk_m: number | null;
};

export function backendEnabled(): boolean {
  return config.backendUrl.length > 0;
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  if (!backendEnabled()) throw new BackendError(0, "BACKEND_URL is not set");
  let res: Response;
  try {
    res = await fetch(`${config.backendUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw new BackendError(0, err instanceof Error ? err.message : "backend unreachable");
  }
  if (!res.ok) {
    let detail = `backend answered ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not JSON */
    }
    throw new BackendError(res.status, detail);
  }
  return (await res.json()) as T;
}

/**
 * Cities and capabilities change when someone seeds a city, not per request.
 * Five minutes keeps a busy server from asking on every tour.
 */
const TTL_MS = 5 * 60_000;
let citiesCache: { at: number; value: BackendCity[] } | null = null;
let metaCache: { at: number; value: BackendMeta } | null = null;

export async function backendCities(): Promise<BackendCity[]> {
  if (citiesCache && Date.now() - citiesCache.at < TTL_MS) return citiesCache.value;
  const value = await call<BackendCity[]>("/cities");
  citiesCache = { at: Date.now(), value };
  return value;
}

export async function backendMeta(): Promise<BackendMeta> {
  if (metaCache && Date.now() - metaCache.at < TTL_MS) return metaCache.value;
  const value = await call<BackendMeta>("/meta");
  metaCache = { at: Date.now(), value };
  return value;
}

/** The backend city whose bounds contain this point, if any. */
export async function backendCityAt(lat: number, lng: number): Promise<BackendCity | null> {
  const cities = await backendCities();
  return (
    cities.find(({ bbox: [minLng, minLat, maxLng, maxLat] }) =>
      lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng,
    ) ?? null
  );
}

export function requestBackendTour(body: BackendTourRequest): Promise<BackendTourResponse> {
  // Resolving a tour may fetch walking legs for new stops, hence the longer clock.
  return call<BackendTourResponse>("/tours", { method: "POST", body: JSON.stringify(body) }, 20_000);
}

/** The tour as it stands, including stops whose recordings are not ready yet. */
export function backendBundle(tourId: number): Promise<BackendBundle> {
  return call<BackendBundle>(`/tours/${tourId}/bundle?partial=true`);
}

/** The tours recorded in advance for a city: ready to walk, nothing to generate. */
export function backendPremadeTours(cityId: number): Promise<BackendPremadeTour[]> {
  return call<BackendPremadeTour[]>(`/cities/${cityId}/tours`);
}

/**
 * A tour only once every stop is recorded — walk-backend answers 409 until
 * then — for a client that downloads the whole thing and walks it offline.
 */
export function backendReadyBundle(tourId: number): Promise<BackendBundle> {
  return call<BackendBundle>(`/tours/${tourId}/bundle`);
}

/** A freshly signed link to one recording. */
export function backendSegment(id: string): Promise<BackendAudio & { transcript: string }> {
  return call(`/segments/${encodeURIComponent(id)}`);
}

/**
 * Move walk-backend's generation queue along by one bounded pass.
 *
 * On Vercel the backend has no long-running worker, so it advances when asked:
 * after a tour that missed, while a walker waits for a stop, and once a day from
 * Vercel Cron. Concurrent nudges are safe — the backend claims work with
 * SKIP LOCKED — and a failed nudge only means the next one does the work.
 */
export async function kickWorker(rounds = 3): Promise<Record<string, number> | null> {
  if (!backendEnabled() || !config.workerSecret) return null;
  try {
    return await call<Record<string, number>>(
      `/internal/worker/tick?rounds=${rounds}`,
      { method: "POST", headers: { authorization: `Bearer ${config.workerSecret}` } },
      55_000,
    );
  } catch (err) {
    console.info("[backend] worker nudge failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Database, storage and generation, checked for real by the backend. */
export function backendHealth(): Promise<Record<string, unknown>> {
  return call("/internal/health", { headers: { authorization: `Bearer ${config.workerSecret}` } }, 20_000);
}
