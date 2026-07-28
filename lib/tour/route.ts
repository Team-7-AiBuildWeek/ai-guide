/**
 * The old-town route, as coordinates only.
 *
 * Client-safe on purpose — no provider imports, no keys — so both the mock LLM
 * (server) and the walk simulator (browser) can share one set of coordinates
 * instead of drifting apart.
 */

export type RoutePoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export const OLD_TOWN_STOPS: RoutePoint[] = [
  { id: "michalska-brana", name: "Michalská brána", lat: 48.1447, lng: 17.1063 },
  { id: "hlavne-namestie", name: "Hlavné námestie", lat: 48.1431, lng: 17.1082 },
  { id: "primacialny-palac", name: "Primaciálny palác", lat: 48.1428, lng: 17.109 },
  { id: "stara-radnica", name: "Stará radnica", lat: 48.1435, lng: 17.1079 },
  { id: "modry-kostol", name: "Modrý kostol", lat: 48.1441, lng: 17.1152 },
  { id: "bratislavsky-hrad", name: "Bratislavský hrad", lat: 48.1421, lng: 17.1002 },
];

/** Metres between two points. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Point `t` of the way (0–1) along the straight line from a to b. */
export function interpolate(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number,
) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** An unhurried walking pace, in metres per second. */
export const WALKING_SPEED_MPS = 1.35;
