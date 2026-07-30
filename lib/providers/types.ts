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

/**
 * A stop on the walk.
 *
 * Written in two passes. The itinerary pass fills everything except `script`
 * and `walkingCueToHere`; those arrive later, one stop at a time, because a
 * four-hour tour is twenty-odd stops and nobody waits five minutes staring at
 * a spinner for narration they will not hear until three o'clock.
 */
export const StopSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * The name as written on the building and in the map data, in the local
   * language. Without it a stop called "Main Square" cannot be found on a map
   * that calls it Hlavné námestie.
   */
  localName: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  /** One line on what this stop is for, carried into the script pass. */
  angle: z.string(),
  /** "walk down the lane, the church is on your right" — second pass. */
  walkingCueToHere: z.string().optional(),
  /** Four to five minutes spoken — second pass. */
  script: z.string().optional(),
});

export const TourPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  stops: z.array(StopSchema).min(1),
});

/** What the second pass returns for one stop. */
export const StopScriptSchema = z.object({
  walkingCueToHere: z.string(),
  script: z.string(),
});

export type Stop = z.infer<typeof StopSchema>;
export type TourPlan = z.infer<typeof TourPlanSchema>;
export type StopScript = z.infer<typeof StopScriptSchema>;

// ------------------------------------------------------------- tour request

/** How long the walker wants to be out, in minutes. */
export type Duration = 30 | 45 | 60 | 90 | 120 | 180 | 240;

/** Slider values are stored as words, not numbers — see the design brief. */
export type Detail = "highlights" | "story" | "everything";
export type Pace = "relaxed" | "steady" | "cover-ground";
export type Interest =
  | "history"
  | "architecture"
  | "food"
  | "art"
  | "hidden"
  | "nature"
  | "music"
  | "literature"
  | "sacred"
  | "royal"
  | "legends"
  | "conflict";

/** Where the walk is. Named, because "somewhere near 48.14, 17.10" is not
 *  something a guide can write about. */
export type City = {
  /** As people say it: "Vienna", "Kraków". */
  name: string;
  /** Disambiguated for the model: "Vienna, Austria". */
  label: string;
  lat: number;
  lng: number;
};

export type TourRequest = {
  /** Free-text view passes the walker's own words through untouched. */
  freeText?: string;
  /** Resolved from GPS or typed in. Absent means the model must infer it from
   *  the coordinates, which it does badly. */
  city?: City;
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

// ------------------------------------------------------------------- asking

/** A question from the street, carrying the brief the walker set out with. */
export type AskRequest = {
  question: string;
  /** BCP-47. */
  lang: string;
  /** The walker's own words from the setup screen — the point of the tour. */
  freeText?: string;
  interests: Interest[];
  detail: Detail;
  tourTitle?: string;
  stopName?: string;
  /** What the guide already said here, so the answer does not repeat it. */
  stopContext?: string;
  /** Which city the question is being asked in. */
  city?: string;
  lat?: number;
  lng?: number;
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

/** A basemap the walker can switch to. */
export type MapStyle = { id: string; label: string; url: string };

/** Deliberately loose: we hand this straight to MapLibre. */
export type GeoJSON = Record<string, unknown>;

/** What the walker has to do next, reduced to the four things an arrow can say. */
export type ManeuverKind = "straight" | "left" | "right" | "uturn" | "arrive";

export type Maneuver = {
  kind: ManeuverKind;
  /** Metres of walking this maneuver covers. */
  meters: number;
  /** The router's own words, for the expanded panel. */
  instruction: string;
  street?: string;
  /** Where this maneuver starts, as an index into the route LineString. */
  beginShapeIndex: number;
};

export type WalkingRoute = {
  geojson: GeoJSON;
  meters: number;
  seconds: number;
  /** Empty when the provider cannot route — the UI falls back to the cue text. */
  maneuvers: Maneuver[];
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
