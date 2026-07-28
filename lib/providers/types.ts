/**
 * Shared domain types for every provider.
 *
 * These are the contract between the app and whichever LLM / TTS / map vendor
 * happens to be plugged in. Nothing vendor-specific belongs in this file.
 */

import { z } from "zod";

// ---------------------------------------------------------------- geography

export type LatLng = { lat: number; lng: number };

export type Place = {
  /** Provider's own id, opaque to us. */
  id: string;
  /** Short label, e.g. "Michalská brána". */
  name: string;
  /** Full address as the provider resolved it. */
  address: string;
  lat: number;
  lng: number;
};

// -------------------------------------------------------------- tour domain

export const StopSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  /** "walk down the lane, the church is on your right" */
  walkingCueToHere: z.string(),
  /** ~40 seconds spoken. */
  scriptShort: z.string(),
  /** ~3 minutes spoken. */
  scriptFull: z.string(),
});

export const TourPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  stops: z.array(StopSchema).min(1),
});

export type Stop = z.infer<typeof StopSchema>;
export type TourPlan = z.infer<typeof TourPlanSchema>;

// ------------------------------------------------------------- tour request

/** How long the walker wants to be out, in minutes. */
export type Duration = 30 | 45 | 60 | 90;

/** Slider values are stored as words, not numbers — see the design brief. */
export type Detail = "highlights" | "story" | "everything";
export type Pace = "relaxed" | "steady" | "cover-ground";
export type Interest = "history" | "architecture" | "food" | "art" | "hidden";

export type TourRequest = {
  /** Free-text view passes the walker's own words through untouched. */
  freeText?: string;
  /** Simple-settings view sends structured values only. */
  durationMinutes: Duration;
  detail: Detail;
  pace: Pace;
  interests: Interest[];
  start: LatLng & { label?: string };
  /** Omitted means "finish near the start" — the route loops. */
  end?: LatLng & { label?: string };
  /** BCP-47, e.g. "sk" or "en". */
  lang: string;
};

// ---------------------------------------------------------------------- tts

export type Voice = {
  id: string;
  name: string;
  /** BCP-47 tags this voice can speak. */
  langs: string[];
  gender?: "male" | "female" | "neutral";
};

// --------------------------------------------------------------------- maps

/** Deliberately loose: we hand this straight to MapLibre. */
export type GeoJSON = Record<string, unknown>;

export type WalkingRoute = {
  geojson: GeoJSON;
  meters: number;
  seconds: number;
};

// ------------------------------------------------------------------ errors

/** Thrown by every provider so the app can distinguish vendor faults. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}
