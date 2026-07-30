"use client";

/**
 * The one map, used by every screen in the flow.
 *
 * It draws whatever it is given — route line, numbered stops, dropped pins,
 * live position — so the flow can change what is on screen without tearing the
 * map down and paying for the tiles again.
 */

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Fix } from "@/lib/tour/useLiveLocation";
import type { MapStyle } from "@/lib/providers/types";

export type MapStop = { id: string; name: string; lat: number; lng: number };
export type MapPin = { kind: "start" | "end"; lat: number; lng: number };

const ACCURACY = "gps-accuracy";
const ROUTE = "tour-route";

/**
 * A city, not a street: close enough to see the shape of the centre, far
 * enough to read as a place rather than four blocks.
 *
 * Used when the camera is pointed at a city's own coordinates, where its name
 * is drawn at the centre of the screen and cannot be missed.
 */
const CITY_ZOOM = 13.5;

/**
 * Wider, for the opening shot, which is centred on the walker rather than on
 * the city.
 *
 * The basemap never stops drawing city names — `place_city` in this style has
 * no maxzoom — so whether you can read which town you are in is only ever a
 * question of whether its centre point is on screen. Landing at street level
 * put four blocks in frame and that point kilometres outside it, which is how
 * the app opened on a map of nowhere in particular. This is about eight
 * kilometres across on a phone: enough to hold the centre from a suburb.
 */
const OPENING_ZOOM = 12.5;

function accuracyPolygon(lat: number, lng: number, meters: number, steps = 64) {
  const coords: [number, number][] = [];
  const latR = meters / 111_320;
  const lngR = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + lngR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } },
    ],
  };
}

function stopMarkerEl(label: string, current: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `stop-pin${current ? " stop-pin--current" : ""}`;
  el.textContent = label;
  return el;
}

function pinMarkerEl(kind: "start" | "end"): HTMLElement {
  const el = document.createElement("div");
  el.className = `drop-pin drop-pin--${kind}`;
  el.textContent = kind === "start" ? "A" : "B";
  return el;
}

export default function TourMap({
  styleUrl,
  center,
  fix,
  dot = null,
  heading = null,
  route = null,
  stops = [],
  currentStopIndex = -1,
  pins = [],
  picking = false,
  onPick,
  bottomInset = 0,
  follow = true,
  fitTo = null,
  lookAt = null,
  showZoom = true,
  styles = [],
  styleId,
}: {
  styleUrl: string;
  center: { lat: number; lng: number };
  fix: Fix | null;
  /** Where to draw the dot, when that is not the raw fix — see `snapToRoute`.
   *  The circle stays on the fix either way, so nothing is hidden. */
  dot?: { lat: number; lng: number } | null;
  /** Degrees clockwise from north, when the device has a compass. */
  heading?: number | null;
  route?: GeoJSON.Feature | null;
  stops?: MapStop[];
  currentStopIndex?: number;
  pins?: MapPin[];
  /** Tapping the map drops a pin instead of doing nothing. */
  picking?: boolean;
  onPick?: (p: { lat: number; lng: number }) => void;
  /** Space the sheet occupies, so the map centres above it. */
  bottomInset?: number;
  follow?: boolean;
  /** Bump this to refit the camera to the whole route. */
  fitTo?: string | null;
  /** Somewhere the walker asked to see — a city chosen by hand. Moves the
   *  camera once per change, and outranks following the GPS fix, which would
   *  otherwise drag the map back home on the next tick. */
  lookAt?: { lat: number; lng: number; key: string } | null;
  /** The tour puts its turn card top-right, where these buttons live. */
  showZoom?: boolean;
  /** Basemaps the walker can switch between. */
  styles?: MapStyle[];
  /** Which of them is showing. Changing this swaps the basemap in place. */
  styleId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const gpsMarker = useRef<Marker | null>(null);
  const stopMarkers = useRef<Marker[]>([]);
  const pinMarkers = useRef<Marker[]>([]);
  const fixRef = useRef<Fix | null>(null);
  const routeRef = useRef<GeoJSON.Feature | null>(null);
  const styleReady = useRef(false);
  const hasCentred = useRef(false);
  const currentStyleRef = useRef<string | undefined>(styleId);
  const onPickRef = useRef(onPick);
  const pickingRef = useRef(picking);

  // Kept in refs so the map's click handler always sees the latest values
  // without the map being torn down and rebuilt on every prop change.
  useEffect(() => {
    onPickRef.current = onPick;
    pickingRef.current = picking;
  }, [onPick, picking]);

  // ------------------------------------------------------------------ map --
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: [center.lng, center.lat],
      zoom: OPENING_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    if (showZoom) map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

    // Swapping the basemap throws away every source and layer on it, so this
    // has to be callable again — not just once on first load.
    const addOurLayers = () => {
      styleReady.current = true;
      if (map.getSource(ROUTE)) return;

      map.addSource(ROUTE, {
        type: "geojson",
        data: routeRef.current ?? { type: "FeatureCollection", features: [] },
      });
      // Casing under the line so it stays readable over any basemap colour.
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: ROUTE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1e7a52", "line-width": 5 },
      });

      map.addSource(ACCURACY, {
        type: "geojson",
        data: fixRef.current
          ? accuracyPolygon(fixRef.current.lat, fixRef.current.lng, fixRef.current.accuracy)
          : { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "gps-accuracy-fill",
        type: "fill",
        source: ACCURACY,
        paint: { "fill-color": "#5eda9b", "fill-opacity": 0.18 },
      });
    };

    map.on("load", addOurLayers);
    // Fired after setStyle finishes; without this the route vanishes on swap.
    map.on("style.load", addOurLayers);

    const click = (e: MapMouseEvent) => {
      if (!pickingRef.current) return;
      onPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on("click", click);

    /**
     * Re-measure whenever the container changes size.
     *
     * The map measures itself once, when it is constructed, which is before
     * the layout it lives in has settled — it came up believing it was 792px
     * wide inside an 814px box. A map whose idea of its own size is stale
     * paints its background and then stops: no tiles are ever requested for
     * the area it does not think it covers, so the app opened on a blank grey
     * screen and only drew the city once something happened to nudge it.
     *
     * An observer rather than a one-off call on `load`, because the same thing
     * happens on rotation, on a phone keyboard opening, and on every change of
     * the sheet's height underneath it.
     */
    const resizer = new ResizeObserver(() => map.resize());
    resizer.observe(containerRef.current);

    return () => {
      resizer.disconnect();
      map.remove();
      mapRef.current = null;
      gpsMarker.current = null;
      stopMarkers.current = [];
      pinMarkers.current = [];
      styleReady.current = false;
    };
  }, [styleUrl, center.lat, center.lng, showZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleId) return;
    const target = styles.find((s) => s.id === styleId);
    if (!target) return;
    // Cheap guard: setStyle on the style already showing would still tear the
    // route down and rebuild it for nothing.
    if (map.getStyle()?.name && currentStyleRef.current === styleId) return;
    currentStyleRef.current = styleId;
    styleReady.current = false;
    map.setStyle(target.url);
  }, [styleId, styles]);

  // Picking mode gets a crosshair so it is obvious the map is now an input.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  // ------------------------------------------------------------- live dot --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    fixRef.current = fix;

    // The dot follows the route where it can; the circle never does, because
    // it is the honest part of this picture.
    const at = dot ?? fix;

    // A DOM overlay needs no style, so it must not wait for one.
    if (!gpsMarker.current) {
      const el = document.createElement("div");
      el.className = "gps-dot";
      el.setAttribute("aria-hidden", "true");
      // The facing cone lives inside the dot so it turns around the dot's
      // centre rather than around a corner of it.
      el.appendChild(Object.assign(document.createElement("div"), { className: "gps-dot__cone" }));
      gpsMarker.current = new Marker({ element: el }).setLngLat([at.lng, at.lat]).addTo(map);
    } else {
      gpsMarker.current.setLngLat([at.lng, at.lat]);
    }

    (map.getSource(ACCURACY) as GeoJSONSource | undefined)?.setData(
      accuracyPolygon(fix.lat, fix.lng, fix.accuracy),
    );

    if (!hasCentred.current) {
      hasCentred.current = true;
      map.easeTo({
        center: [at.lng, at.lat],
        zoom: OPENING_ZOOM,
        duration: 800,
        padding: { bottom: bottomInset },
      });
    } else if (follow) {
      map.easeTo({ center: [at.lng, at.lat], duration: 600, padding: { bottom: bottomInset } });
    }
  }, [fix, dot, follow, bottomInset]);

  /**
   * Turn the cone.
   *
   * Its own effect, and a direct style write rather than a re-render: the
   * compass reports several times a second, and the dot's position has nothing
   * to do with which way it points. The map's bearing is fixed at north, so
   * the heading needs no correction — if that ever changes, subtract
   * `map.getBearing()` here.
   */
  useEffect(() => {
    const el = gpsMarker.current?.getElement().querySelector<HTMLElement>(".gps-dot__cone");
    if (!el) return;
    if (heading === null) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.transform = `translate(-50%, -100%) rotate(${heading}deg)`;
  }, [heading, fix]);

  // --------------------------------------------------------------- lookAt --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lookAt) return;
    // Also claims the first-centre flag, so a late-arriving GPS fix does not
    // then snap the camera home from the city that was just asked for.
    hasCentred.current = true;
    map.easeTo({
      center: [lookAt.lng, lookAt.lat],
      zoom: CITY_ZOOM,
      duration: 900,
      padding: { bottom: bottomInset },
    });
    // bottomInset deliberately absent: a sheet opening must not re-fly the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookAt?.key]);

  // ---------------------------------------------------------------- route --
  useEffect(() => {
    const map = mapRef.current;
    routeRef.current = route;
    if (!map) return;
    const apply = () =>
      (map.getSource(ROUTE) as GeoJSONSource | undefined)?.setData(
        route ?? { type: "FeatureCollection", features: [] },
      );
    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [route]);

  // ---------------------------------------------------------------- stops --
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = stops.map((s, i) =>
      new Marker({ element: stopMarkerEl(String(i + 1), i === currentStopIndex) })
        .setLngLat([s.lng, s.lat])
        .addTo(map),
    );
  }, [stops, currentStopIndex]);

  // ----------------------------------------------------------------- pins --
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinMarkers.current.forEach((m) => m.remove());
    pinMarkers.current = pins.map((p) =>
      new Marker({ element: pinMarkerEl(p.kind), draggable: false })
        .setLngLat([p.lng, p.lat])
        .addTo(map),
    );
  }, [pins]);

  // ------------------------------------------------------------------ fit --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitTo || stops.length === 0) return;
    const fit = () => {
      const lats = stops.map((s) => s.lat);
      const lngs = stops.map((s) => s.lng);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 90, left: 50, right: 50, bottom: bottomInset + 40 }, duration: 900 },
      );
    };
    if (styleReady.current) fit();
    else map.once("load", fit);
  }, [fitTo, stops, bottomInset]);

  return (
    <>
      {/* Sized, not inset: maplibre-gl.css forces `position: relative` on its
          own container, which cancels `absolute inset-0` and leaves it 0 tall. */}
      <div ref={containerRef} className="h-full w-full" />
      <style>{`
        .gps-dot { position: relative; width: 18px; height: 18px; border-radius: 999px;
          background: #5eda9b; border: 3px solid #fff;
          box-shadow: 0 0 0 1px rgba(17,24,39,.35), 0 2px 6px rgba(17,24,39,.4); }
        .gps-dot::after { content: ""; position: absolute; inset: -9px; border-radius: 999px;
          border: 2px solid #5eda9b; animation: gps-pulse 2.4s ease-out infinite; }
        /* Which way you are facing. Anchored at the dot's centre and rotated
           about it, so 0deg points north up the screen. A soft edge, because
           a compass is a rough instrument and a hard-edged beam claims a
           precision it does not have. */
        .gps-dot__cone { position: absolute; left: 50%; top: 50%; width: 54px; height: 40px;
          transform-origin: 50% 100%; transform: translate(-50%, -100%);
          opacity: 0; transition: transform 180ms linear, opacity 200ms ease;
          background: conic-gradient(from -22deg at 50% 100%,
            rgba(94,218,155,0) 0deg, rgba(94,218,155,.55) 12deg,
            rgba(94,218,155,.55) 32deg, rgba(94,218,155,0) 44deg);
          -webkit-mask-image: radial-gradient(60% 100% at 50% 100%, #000 40%, transparent 100%);
          mask-image: radial-gradient(60% 100% at 50% 100%, #000 40%, transparent 100%);
          pointer-events: none; }
        @keyframes gps-pulse { 0% { transform: scale(.6); opacity: .9 } 100% { transform: scale(1.6); opacity: 0 } }

        .stop-pin { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px;
          background: #fff; color: #111827; border: 2px solid #1e7a52;
          font-family: var(--font-space-grotesk), sans-serif; font-size: 15px; font-weight: 600;
          font-variant-numeric: tabular-nums; box-shadow: 0 2px 6px rgba(17,24,39,.3); cursor: pointer; }
        .stop-pin--current { background: #111827; color: #5eda9b; border-color: #5eda9b;
          width: 36px; height: 36px; font-size: 17px; }

        .drop-pin { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px 999px 999px 4px;
          transform: rotate(-45deg); font-family: var(--font-space-grotesk), sans-serif; font-weight: 700;
          box-shadow: 0 2px 8px rgba(17,24,39,.35); }
        .drop-pin::first-line { }
        .drop-pin--start { background: #5eda9b; color: #111827; }
        .drop-pin--end { background: #111827; color: #5eda9b; }

        @media (prefers-reduced-motion: reduce) { .gps-dot::after { animation: none; opacity: .5 } }
      `}</style>
    </>
  );
}
