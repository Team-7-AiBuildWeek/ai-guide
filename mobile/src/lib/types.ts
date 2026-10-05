/** The offline bundle, as the web app's /api/mobile/tours/[id] returns it. */

export type Leg = {
  distance_m: number;
  duration_s: number;
  polyline: string;
  polyline_precision: number;
  instructions: { text: string; distance_m: number; duration_s: number; street: string | null }[];
};

export type BundleStop = {
  position: number;
  poi_id: number;
  name: string;
  local_name: string | null;
  lat: number;
  lng: number;
  trigger_radius_m: number;
  audio: { url: string; duration_ms: number; bytes: number; content_type: string; id: string } | null;
  transcript: string | null;
  sources: { url: string; license: string }[];
  walk_to_next: Leg | null;
};

export type Bundle = {
  manifest_version: number;
  status: string;
  tour: { id: number; city_id: number; theme: string; language: string; total_duration_ms: number | null; total_walk_m: number | null };
  stops: BundleStop[];
};

export type NearbyTour = { id: number; theme: string; language: string; stops: number; minutes: number; walkMeters: number | null };
export type Nearby = { city: { id: number; name: string } | null; tours: NearbyTour[] };

/** A tour saved on the phone: the bundle, with each stop's audio as a local file. */
export type SavedTour = Bundle & { cityName: string; savedAt: string; stops: (BundleStop & { localAudio: string })[] };
