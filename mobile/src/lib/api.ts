/**
 * The app talks to the same /api routes the website does, on the deployed
 * site. Every key stays on the server.
 */

import Constants from "expo-constants";
import { fetch as streamingFetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import { audioDir } from "./store";
import type { City, Place, Stop, StopPhoto, StoredTour, TourPlan, TourPreview, TourRequest } from "./types";

export const BASE: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "https://ai-guide-phi.vercel.app";

async function errorFrom(res: Response | { status: number; json: () => Promise<unknown> }, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* not JSON */
  }
  return `${fallback} (${res.status})`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorFrom(res, "The server said no"));
  return (await res.json()) as T;
}

// ------------------------------------------------------------- building --

export type TourEvent = {
  phase: string;
  message?: string;
  data?: StoredTour;
  preview?: TourPreview;
  opening?: string;
};

/**
 * Build a tour: the website's /api/tours stream, read event by event.
 * Resolves with the finished tour; throws with the server's own words.
 */
export async function buildTour(
  req: TourRequest,
  plan: TourPlan | undefined,
  onEvent: (e: TourEvent) => void,
  signal: AbortSignal,
): Promise<StoredTour> {
  const started = Date.now();
  let lastPhase = "stops";
  const res = await streamingFetch(`${BASE}/api/tours`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(plan ? { ...req, plan } : req),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Server said ${res.status}.`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const chunk = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
      if (!chunk.startsWith("data:")) continue;
      const evt = JSON.parse(chunk.slice(5).trim()) as TourEvent;
      lastPhase = evt.phase;
      onEvent(evt);
      if (evt.phase === "error") throw new Error(evt.message ?? "Generation failed.");
      if (evt.phase === "done" && evt.data) return { ...evt.data, req };
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  throw new Error(
    `The connection closed after ${seconds}s, during "${lastPhase}", before the tour was finished.`,
  );
}

// ---------------------------------------------------------------- stops --

export type WrittenStop = {
  script: string;
  walkingCueToHere?: string;
  audio?: { src: string; durationMs: number };
};

export function writeStop(req: TourRequest, stops: Stop[], index: number): Promise<WrittenStop> {
  return postJson<WrittenStop>("/api/stops/script", {
    req,
    stop: stops[index],
    previous: index > 0 ? stops[index - 1] : null,
    position: index + 1,
    total: stops.length,
  });
}

// ---------------------------------------------------------------- voice --

/** A short, stable file name for a piece of text in a language. */
function nameFor(text: string, lang: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  const s = `${lang}\u0000${text}`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const EXTENSION: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
};

/**
 * The guide's voice for one piece of narration, saved on the phone.
 * A piece already voiced is never asked for twice, and plays without signal.
 */
export async function speak(text: string, lang: string): Promise<string> {
  const dir = audioDir();
  const base = nameFor(text, lang);
  for (const ext of ["wav", "mp3", "m4a", "aac", "ogg"]) {
    const held = new File(dir, `${base}.${ext}`);
    if (held.exists && held.size > 0) return held.uri;
  }
  const res = await fetch(`${BASE}/api/audio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(await errorFrom(res, "Could not record this stop"));
  const mime = (res.headers.get("content-type") ?? "audio/wav").split(";")[0].trim();
  const file = new File(dir, `${base}.${EXTENSION[mime] ?? "wav"}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!file.exists) file.create();
  file.write(bytes);
  return file.uri;
}

/** A finished recording from the backend, kept on the phone like the rest. */
export async function keepRecording(src: string): Promise<string> {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  const file = new File(audioDir(), `${nameFor(src.split("?")[0], "rec")}.mp3`);
  if (file.exists && file.size > 0) return file.uri;
  await File.downloadFileAsync(url, file, { idempotent: true });
  return file.uri;
}

// --------------------------------------------------------------- places --

function qualifier(place: Place): string {
  const rest = place.address
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== place.name);
  return rest.length > 0 ? rest[rest.length - 1] : "";
}

function toCity(place: Place): City {
  const extra = qualifier(place);
  return { name: place.name, label: extra ? `${place.name}, ${extra}` : place.name, lat: place.lat, lng: place.lng };
}

async function places(query: string): Promise<Place[]> {
  try {
    const res = await fetch(`${BASE}/api/geocode?${query}`);
    const body = (await res.json()) as { places?: Place[] };
    return body.places ?? [];
  } catch {
    return [];
  }
}

/**
 * Which city the walker is in. The website's lookup first; when that has
 * nothing, the phone's own (Apple's) reverse geocoder, which needs no key.
 */
export async function cityAt(lat: number, lng: number, lang: string): Promise<City | null> {
  const place = (await places(`kind=city&lat=${lat}&lng=${lng}&lang=${encodeURIComponent(lang)}`))[0];
  if (place && place.name !== "Dropped pin") return toCity(place);
  try {
    const [found] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const name = found?.city ?? found?.subregion ?? found?.region;
    if (!name) return null;
    return { name, label: found?.country ? `${name}, ${found.country}` : name, lat, lng };
  } catch {
    return null;
  }
}

export async function searchCities(q: string, lang: string): Promise<City[]> {
  if (q.trim().length < 2) return [];
  const seen = new Set<string>();
  return (await places(`kind=city&q=${encodeURIComponent(q.trim())}&lang=${encodeURIComponent(lang)}`))
    .map(toCity)
    .filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
}

export function searchPlaces(q: string, lang: string, near: { lat: number; lng: number } | null): Promise<Place[]> {
  const nearby = near ? `&nearLat=${near.lat}&nearLng=${near.lng}` : "";
  return places(`q=${encodeURIComponent(q.trim())}${nearby}&lang=${encodeURIComponent(lang)}`);
}

// ------------------------------------------------------------ the rest --

export async function ask(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { answer?: string; error?: string };
  if (!res.ok || !json.answer) throw new Error(json.error ?? "Could not answer.");
  return json.answer;
}

export async function stopPhoto(stop: Stop, lang: string): Promise<StopPhoto | null> {
  const params = new URLSearchParams({ name: stop.name, lat: String(stop.lat), lng: String(stop.lng), lang });
  if (stop.localName) params.set("localName", stop.localName);
  try {
    const res = await fetch(`${BASE}/api/stops/photo?${params.toString()}`);
    const body = (await res.json()) as { photo?: StopPhoto | null };
    return body.photo ?? null;
  } catch {
    return null;
  }
}
