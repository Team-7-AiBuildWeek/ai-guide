/**
 * Stadia Maps: tiles, geocoding and walking routes from one key.
 *
 * The only provider here that covers all four methods with a single account,
 * which makes it the sensible default once you have a key.
 *
 * Shapes taken from their published OpenAPI spec (https://api.stadiamaps.com/openapi.yaml):
 *   - auth is `api_key` as a QUERY parameter on every call, including the POST
 *   - geocoding v2 returns a GeoJSON FeatureCollection
 *   - routing is Valhalla: POST /route/v1, and the leg shape is an encoded
 *     polyline with SIX digits of precision, not the usual five
 */

import { config, requireKey } from "@/lib/config";
import {
  ProviderError,
  type LatLng,
  type Maneuver,
  type ManeuverKind,
  type MapStyle,
  type Place,
  type WalkingRoute,
} from "@/lib/providers/types";
import type { GeocodeOptions, MapProvider } from "./index";

/**
 * Pelias layers that are a settlement someone could walk around.
 *
 * Deliberately no `borough`: a fix in central Kraków resolves to Śródmieště,
 * which is a district, and a guide told it is writing about "Śródmieście" will
 * write about the wrong thing. Better to fail and be asked than to be precise
 * about the wrong place.
 */
const CITY_LAYERS = "locality,localadmin";

/** Things a walker can stand in front of. Stadia rejects `intersection`. */
const PRECISE_LAYERS = "venue,address,street";

/**
 * Places a walker can be *in*: the district, the town, the street.
 *
 * Deliberately without `venue` — see `suggest`, where these are asked for
 * separately precisely so that the points-of-interest index cannot bury them.
 */
const WHERE_LAYERS = "street,neighbourhood,borough,localadmin,locality";

/** How far a district may be and still be worth putting first. */
const AREA_LEAD_KM = 25;

type GeocodeFeature = {
  geometry: { coordinates: [number, number] } | null;
  properties: {
    gid: string;
    name: string;
    layer: string;
    coarse_location?: string | null;
    formatted_address_line?: string | null;
    formatted_address_lines?: string[] | null;
    /** v1 only: "Petržalské korzo, Bratislava, Slovakia". */
    label?: string | null;
    /** Kilometres from the focus point, when one was given. */
    distance?: number | null;
  };
};

type GeocodeResponse = { features?: GeocodeFeature[] };

type ValhallaManeuver = {
  type: number;
  instruction?: string;
  street_names?: string[];
  length?: number;
  begin_shape_index?: number;
};

type RouteResponse = {
  trip?: {
    legs?: Array<{
      shape: string;
      maneuvers?: ValhallaManeuver[];
      summary?: { time: number; length: number };
    }>;
    summary?: { time: number; length: number };
  };
};

/**
 * Valhalla's 39 maneuver codes, reduced to the four an arrow can express.
 *
 * Ramps, merges and roundabout entries all read as "keep going" to someone on
 * foot in an old town, so they collapse into straight rather than inventing a
 * distinction the walker cannot act on.
 */
const KIND_BY_CODE: Record<number, ManeuverKind> = {
  4: "arrive", 5: "arrive", 6: "arrive",
  2: "right", 5.1: "right", 9: "right", 10: "right", 11: "right",
  18: "right", 20: "right", 23: "right", 37: "right",
  3: "left", 14: "left", 15: "left", 16: "left",
  19: "left", 21: "left", 24: "left", 38: "left",
  12: "uturn", 13: "uturn",
};

function maneuverKind(code: number): ManeuverKind {
  return KIND_BY_CODE[code] ?? "straight";
}

/**
 * Decode a Google-style encoded polyline.
 *
 * Valhalla emits precision 6. Passing 5 here silently yields coordinates ten
 * times too small — a route through the Gulf of Guinea rather than Bratislava.
 */
function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    // GeoJSON order: [lng, lat].
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

function toPlace(f: GeocodeFeature): Place | null {
  if (!f.geometry) return null;
  const p = f.properties;
  // v1's label leads with the name the caller is already showing in bold, so
  // it is trimmed down to what the name does not say: the city and country.
  const context =
    p.label && p.label.startsWith(`${p.name}, `) ? p.label.slice(p.name.length + 2) : p.label;
  const address =
    p.formatted_address_lines?.join(", ") ??
    p.formatted_address_line ??
    context ??
    p.coarse_location ??
    p.name;
  return {
    id: p.gid,
    name: p.name,
    address,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  };
}

export class StadiaMapProvider implements MapProvider {
  readonly name = "stadia";

  private key(): string {
    return requireKey(config.stadiaApiKey, "STADIA_API_KEY", "stadia");
  }

  private url(path: string, params: Record<string, string | number> = {}): string {
    const u = new URL(path, config.stadiaBaseUrl);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    u.searchParams.set("api_key", this.key());
    return u.toString();
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
      // Never let the key reach a log line.
      const safe = url.replace(/api_key=[^&]+/, "api_key=***");
      throw new ProviderError(this.name, `HTTP ${res.status} on ${safe}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async geocode(query: string, opts: GeocodeOptions = {}): Promise<Place[]> {
    const { bounds, focus, kind = "place", lang = "en" } = opts;
    // The walker's search box is somebody typing, not somebody who has
    // finished. That is a different endpoint and a different problem — see
    // `suggest`.
    if (kind === "place") return this.suggest(query, opts);
    // With bounds this is a hard circle, not a preference — anything outside
    // is not returned at all. A focus point only reorders, so it is safe to
    // leave off entirely: a city search has to be able to reach any country.
    const near = bounds ?? focus;
    const body = await this.json<GeocodeResponse>(
      this.url("/geocoding/v2/search", {
        text: query,
        ...(bounds
          ? {
              "boundary.circle.lat": bounds.lat,
              "boundary.circle.lon": bounds.lng,
              "boundary.circle.radius": bounds.radiusKm,
            }
          : {}),
        ...(near ? { "focus.point.lat": near.lat, "focus.point.lon": near.lng } : {}),
        ...(kind === "city"
          ? { layers: CITY_LAYERS }
          : kind === "precise"
            ? { layers: PRECISE_LAYERS }
            : {}),
        size: 6,
        lang,
      }),
    );
    return (body.features ?? []).map(toPlace).filter((p): p is Place => p !== null);
  }

  /**
   * The search box, while it is being typed into.
   *
   * Three things were wrong with running this through `/search`:
   *
   *  1. `/search` does not match prefixes. "pe" is not a word in "Petržalka",
   *     so nothing local matched at all — and with nothing local to rank, the
   *     focus point had nothing to do, and the walker got Peru, Pernambuco and
   *     Perm. `/autocomplete` is the endpoint built for a half-typed word.
   *  2. The POI index buries everything else. Asked for twenty results for
   *     "pe" it returns twenty points of interest — three of them statues of
   *     Sándor Petőfi — and never once the district of eighty thousand people
   *     whose name begins with those letters. No single query can be re-ranked
   *     out of that, because the streets and districts are never in it.
   *  3. Landmarks still matter: "mich" should find Michael's Gate, "hrad" the
   *     castle. Those only come from that same POI index.
   *
   * So: two queries, one for places a walker can be *in* — districts, towns,
   * streets — and one for things they can stand in front of. Districts lead,
   * because a short word is more often the start of a big obvious thing than
   * of a statue, and the rest alternate so neither kind can crowd the other
   * out. Six results, from about sixteen.
   */
  private async suggest(text: string, opts: GeocodeOptions): Promise<Place[]> {
    const { bounds, focus, lang = "en" } = opts;
    const near = bounds ?? focus;
    const common = {
      text,
      size: 8,
      lang,
      ...(near ? { "focus.point.lat": near.lat, "focus.point.lon": near.lng } : {}),
    };

    const [where, what] = await Promise.allSettled([
      this.json<GeocodeResponse>(
        this.url("/geocoding/v1/autocomplete", { ...common, layers: WHERE_LAYERS }),
      ),
      this.json<GeocodeResponse>(
        this.url("/geocoding/v1/autocomplete", { ...common, layers: "venue" }),
      ),
    ]);
    // One index having a bad day should cost half the suggestions, not all of
    // them. Both failing is a real failure and is allowed to surface.
    if (where.status === "rejected" && what.status === "rejected") throw where.reason;

    const whereFeatures = where.status === "fulfilled" ? (where.value.features ?? []) : [];
    const pick = (test: (f: GeocodeFeature) => boolean) =>
      whereFeatures
        .filter(test)
        .map(toPlace)
        .filter((p): p is Place => p !== null);

    // A district only leads if it is one the walker could walk to. Without
    // this, "mich" put Michelhausen — a village an hour up the Danube — above
    // Michalská, the street two minutes away, purely for being a district.
    const isArea = (f: GeocodeFeature) => f.properties.layer !== "street";
    const nearby = (f: GeocodeFeature) => (f.properties.distance ?? Infinity) <= AREA_LEAD_KM;

    const areas = pick((f) => isArea(f) && nearby(f));
    const streets = pick((f) => !isArea(f));
    const farAreas = pick((f) => isArea(f) && !nearby(f));
    const venues =
      what.status === "fulfilled"
        ? (what.value.features ?? []).map(toPlace).filter((p): p is Place => p !== null)
        : [];

    const out: Place[] = [];
    const seen = new Set<string>();
    const add = (p: Place | undefined) => {
      if (!p || out.length >= 6 || seen.has(p.name)) return;
      seen.add(p.name);
      out.push(p);
    };

    areas.slice(0, 2).forEach(add);
    for (let i = 0; i < 8; i++) {
      add(streets[i]);
      add(venues[i]);
    }
    // Somewhere further afield is still a better answer than nothing, so the
    // ones held back above fill whatever room is left.
    farAreas.forEach(add);
    return out;
  }

  async reverseGeocode(lat: number, lng: number, opts: GeocodeOptions = {}): Promise<Place> {
    const { kind = "place", lang = "en" } = opts;
    const body = await this.json<GeocodeResponse>(
      this.url("/geocoding/v2/reverse", {
        "point.lat": lat,
        "point.lon": lng,
        ...(kind === "city" ? { layers: CITY_LAYERS } : {}),
        size: 1,
        lang,
      }),
    );
    const place = (body.features ?? []).map(toPlace).find((p): p is Place => p !== null);
    if (!place) {
      return { id: `pin-${lat.toFixed(5)},${lng.toFixed(5)}`, name: "Dropped pin", address: "", lat, lng };
    }
    // A dropped pin keeps exactly where it was dropped and only borrows the
    // label. A city keeps its own centre — that is the whole point of asking.
    return kind === "city" ? place : { ...place, lat, lng };
  }

  /**
   * The pretty way, as far as a router can know what pretty means.
   *
   * Valhalla has no idea which streets are beautiful. What it knows is what
   * kind of way each one is, and in an old town that correlates well enough:
   * the lanes and passages are the pretty part and the four-lane road is not.
   *
   * `shortest` being off is most of the change — with it on, Valhalla
   * optimises distance and every preference here is ignored. The factors are
   * few because they were measured, not guessed. Six real legs across
   * Bratislava, comparing each setting against Valhalla's own defaults:
   *
   *  - `alley_factor` and `use_living_streets` are what put a walk down the
   *    passages instead of along the street beside them.
   *  - `driveway_factor` and `service_factor` are guards, not improvements —
   *    none of the measured legs went near a delivery yard, but a tour that
   *    routes behind a supermarket has failed at something basic.
   *  - `sidewalk_factor` and `use_hills` changed nothing on any leg, at any
   *    value, so they are not here. Inert knobs read as decisions.
   *  - `walkway_factor` is deliberately absent: at 0.4 it made things *worse*.
   *    Between Hlavné námestie and St Martin's it left Ventúrska and
   *    Kapitulská — the lanes anyone would walk — for the open plaza at
   *    Rudnayovo námestie, because a plaza is also tagged a walkway and it is
   *    a bigger one. Favouring walkways favours the widest walkway.
   */
  private static readonly SCENIC = {
    alley_factor: 0.5, // the passages an old town is made of
    use_living_streets: 1, // shared-surface lanes: yes, please
    driveway_factor: 8, // back of a supermarket: no
    service_factor: 4, // service roads and delivery yards
    use_ferry: 0,
  };

  /** The same walk, optimised for distance. The comparison, and the fallback. */
  private static readonly DIRECT = {
    shortest: true,
    walkway_factor: 1,
    sidewalk_factor: 1,
    alley_factor: 1,
    use_ferry: 0,
  };

  /**
   * How much longer the pretty way may be before it stops reading as pretty.
   *
   * Unbounded, "scenic" sends someone around three sides of a block they can
   * see across, and an app that does that is not romantic, it is broken. A
   * third further is a couple of extra minutes on a half-hour walk — noticed
   * as a nicer street, not as a detour.
   *
   * It earns its place: from Eurovea to the castle the scenic costing wants
   * Špitálska and 900 m extra, while the short way goes along the river and up
   * the castle steps, which is the better walk by any reading. The cap throws
   * the detour away and keeps the steps.
   *
   * Measured against the whole trip rather than each leg, which is the
   * forgiving way round: one leg that wanders is absorbed by five that do not,
   * and one genuinely better long way is not thrown away because of a
   * neighbour.
   */
  private static readonly MAX_DETOUR = 1.35;

  async walkingRoute(points: LatLng[]): Promise<WalkingRoute> {
    if (points.length < 2) {
      throw new ProviderError(this.name, "a route needs at least two points");
    }

    // Both at once: one round trip's latency for two answers, and the walk is
    // routed once per tour, so the second request is cheap next to the twenty
    // model calls that already happened.
    const [scenic, direct] = await Promise.all([
      this.routeWith(points, StadiaMapProvider.SCENIC),
      this.routeWith(points, StadiaMapProvider.DIRECT).catch(() => null),
    ]);

    if (!direct) return scenic;
    // The pretty way, unless it has stopped being a walk and become a detour.
    return scenic.meters <= direct.meters * StadiaMapProvider.MAX_DETOUR ? scenic : direct;
  }

  private async routeWith(
    points: LatLng[],
    pedestrian: Record<string, number | boolean>,
  ): Promise<WalkingRoute> {
    const body = await this.json<RouteResponse>(this.url("/route/v1"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
        costing: "pedestrian",
        costing_options: { pedestrian },
        units: "kilometers",
      }),
    });

    const legs = body.trip?.legs ?? [];
    if (legs.length === 0) throw new ProviderError(this.name, "no walking route found");

    // One leg per pair of stops; stitch them into a single line for the map.
    const coordinates = legs.flatMap((leg, i) => {
      const decoded = decodePolyline(leg.shape);
      // Drop each leg's first point — it duplicates the previous leg's last.
      return i === 0 ? decoded : decoded.slice(1);
    });

    // Maneuvers are per leg and their shape indices are leg-local, so they need
    // shifting onto the stitched line — and each leg after the first lost its
    // duplicated opening point above.
    const maneuvers: Maneuver[] = [];
    let offset = 0;
    legs.forEach((leg, i) => {
      const legPoints = decodePolyline(leg.shape).length;
      for (const m of leg.maneuvers ?? []) {
        maneuvers.push({
          kind: maneuverKind(m.type),
          // Valhalla reports length in the request's units — kilometres here.
          meters: Math.round((m.length ?? 0) * 1000),
          instruction: m.instruction ?? "",
          street: m.street_names?.[0],
          beginShapeIndex: offset + (m.begin_shape_index ?? 0),
        });
      }
      offset += i === 0 ? legPoints : legPoints - 1;
    });

    const summary =
      body.trip?.summary ??
      legs.reduce(
        (acc, l) => ({
          time: acc.time + (l.summary?.time ?? 0),
          length: acc.length + (l.summary?.length ?? 0),
        }),
        { time: 0, length: 0 },
      );

    return {
      geojson: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      },
      meters: summary.length * 1000, // `units: kilometers` above
      seconds: summary.time,
      maneuvers,
    };
  }

  /**
   * The only provider method whose result reaches the browser.
   *
   * With domain auth on, the key is left out entirely and Stadia authorises by
   * Origin/Referer — so nothing secret is ever rendered into the page. Without
   * it, the key rides along and is readable by anyone; that is inherent to
   * client-side tiles, not a leak we introduced, but it is why domain auth is
   * the right setting in production.
   */
  tileStyleUrl(): string {
    return this.styleUrl(config.stadiaStyle);
  }

  private styleUrl(style: string): string {
    const base = `https://tiles.stadiamaps.com/styles/${style}.json`;
    return config.stadiaDomainAuth ? base : `${base}?api_key=${this.key()}`;
  }

  /**
   * The four worth offering on a walking tour. Satellite is the one people
   * actually reach for — it answers "which of these buildings is it".
   */
  styles(): MapStyle[] {
    const options: [string, string][] = [
      [config.stadiaStyle, "Map"],
      ["alidade_satellite", "Satellite"],
      ["outdoors", "Outdoors"],
      ["alidade_smooth_dark", "Dark"],
    ];
    const seen = new Set<string>();
    return options
      .filter(([id]) => !seen.has(id) && seen.add(id))
      .map(([id, label]) => ({ id, label, url: this.styleUrl(id) }));
  }
}
