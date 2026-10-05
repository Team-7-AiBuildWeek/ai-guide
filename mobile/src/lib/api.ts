/**
 * The app talks only to the web app's /api/mobile routes. The backend's address
 * and every key stay on the server; what comes back is recorded content and
 * short-lived signed links to MP3s.
 */

import Constants from "expo-constants";
import type { Bundle, Nearby } from "./types";

const BASE: string = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "https://ai-guide-phi.vercel.app";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    let message = `The server said ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function nearbyTours(lat: number, lng: number): Promise<Nearby> {
  return getJson<Nearby>(`/api/mobile/tours?lat=${lat}&lng=${lng}`);
}

export function tourBundle(id: number): Promise<Bundle> {
  return getJson<Bundle>(`/api/mobile/tours/${id}`);
}
