/**
 * The website's tour types (lib/providers/types.ts, lib/tour/flow.ts), as the
 * app receives them from the same /api routes.
 */

export type LatLng = { lat: number; lng: number };

export type Place = { id: string; name: string; address: string; lat: number; lng: number };

export type City = { name: string; label: string; lat: number; lng: number };

export type Duration = 30 | 45 | 60 | 90 | 120 | 180 | 240;
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

export type Stop = {
  id: string;
  name: string;
  localName?: string;
  lat: number;
  lng: number;
  angle: string;
  walkingCueToHere?: string;
  script?: string;
  audio?: { src: string; durationMs: number };
  backend?: { tourId: number; position: number };
};

export type TourPlan = { title: string; summary: string; stops: Stop[] };

export type TourRequest = {
  freeText?: string;
  city?: City;
  durationMinutes: Duration;
  detail: Detail;
  pace: Pace;
  interests: Interest[];
  start: LatLng & { label?: string };
  end?: LatLng & { label?: string };
  lang: string;
};

export type ManeuverKind = "straight" | "left" | "right" | "uturn" | "arrive";

export type Maneuver = {
  kind: ManeuverKind;
  meters: number;
  instruction: string;
  street?: string;
  beginShapeIndex: number;
};

export type TourRide = {
  from: number;
  to: number;
  mode: "tram" | "bus" | "trolleybus" | "subway" | "light_rail";
  ref: string;
  headsign?: string;
  board: { name: string; lat: number; lng: number };
  alight: { name: string; lat: number; lng: number };
  stops: number;
  minutes: number;
};

/** A GeoJSON LineString feature, which is all the route ever is. */
export type RouteFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

export type StoredTour = {
  plan: TourPlan;
  req?: TourRequest;
  route: RouteFeature | null;
  meters: number;
  seconds: number;
  maneuvers?: Maneuver[];
  rides?: TourRide[];
  /** A saved tour opened with the Demo button (/api/demo-tour): played back from storage, not added to history. */
  demo?: boolean;
};

export type TourPreview = { title: string; summary: string; stops: { name: string; angle: string }[] };

export type Point = LatLng & { label?: string };

export type Draft = {
  freeText: string;
  city: City | null;
  durationMinutes: Duration;
  detail: Detail;
  pace: Pace;
  interests: Interest[];
  start: Point | null;
  end: Point | null;
  lang: string;
};

export type Stage = "start" | "brief" | "points" | "generating" | "headphones" | "tour";

export type StopPhoto = { url: string; width: number; height: number; title: string; page: string };

/** A location reading: where, and how sure. */
export type Fix = LatLng & { accuracy: number };
