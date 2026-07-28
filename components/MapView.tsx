"use client";

/**
 * Full-screen map with live GPS.
 *
 * Foreground only — `watchPosition` while the app is open. Background
 * geolocation does not exist on the web, so nothing here should ever be relied
 * on while the phone is in a pocket.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useSimulatedWalk } from "@/lib/tour/useSimulatedWalk";

type Fix = {
  lat: number;
  lng: number;
  /** Metres, as reported by the device. */
  accuracy: number;
  at: number;
};

type Status =
  | { kind: "locating" }
  | { kind: "tracking" }
  | { kind: "error"; message: string; hint?: string };

const ACCURACY_SOURCE = "gps-accuracy";

/**
 * MapLibre only sizes circles in pixels, so an accuracy radius in metres has
 * to be drawn as a polygon or it lies at every zoom but one.
 */
function accuracyPolygon(lat: number, lng: number, meters: number, steps = 64) {
  const coords: [number, number][] = [];
  const latRadius = meters / 111_320;
  const lngRadius = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lng + lngRadius * Math.cos(theta), lat + latRadius * Math.sin(theta)]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [coords] },
      },
    ],
  };
}

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function describeError(err: GeolocationPositionError): { message: string; hint?: string } {
  // Over plain http the browser refuses geolocation outright, and reports it as
  // a permission denial — which sends you hunting through settings for a
  // permission that was never the problem. Name the real cause first.
  const insecure = typeof window !== "undefined" && !window.isSecureContext;

  switch (err.code) {
    case err.PERMISSION_DENIED:
      return insecure
        ? {
            message: "Location needs a secure connection.",
            hint: "This page is not on HTTPS or localhost, so the browser blocks GPS before it ever asks you.",
          }
        : {
            message: "Location permission was refused.",
            hint: "Allow location for this site in your browser settings, then reload.",
          };
    case err.POSITION_UNAVAILABLE:
      // On a Mac this nearly always means Location Services, not the sky —
      // desktop browsers position by wifi, so "step outside" is useless advice.
      return {
        message: "No position available.",
        hint: isApplePlatform()
          ? "On a Mac: System Settings → Privacy & Security → Location Services, and tick your browser. On a phone: step outside, indoors there may be no fix."
          : "Step outside — indoors or underground there may be no fix.",
      };
    case err.TIMEOUT:
      return { message: "Timed out waiting for a fix.", hint: "Try again outdoors." };
    default:
      return { message: err.message || "Location failed." };
  }
}

export default function MapView({
  styleUrl,
  center,
  initialSimulate = false,
}: {
  styleUrl: string;
  center: { lat: number; lng: number };
  /** From `?sim` on the server, so no effect has to read the URL after mount. */
  initialSimulate?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  /** Latest fix, so the style-load handler can seed the accuracy source. */
  const fixRef = useRef<Fix | null>(null);
  /** Only the first fix moves the camera; after that the walker stays in control. */
  const hasCenteredRef = useRef(false);

  // "locating" is the honest initial state — the watch starts on mount.
  const [status, setStatus] = useState<Status>({ kind: "locating" });
  const [realFix, setRealFix] = useState<Fix | null>(null);
  const [follow, setFollow] = useState(true);
  const [simulating, setSimulating] = useState(initialSimulate);

  const simFix = useSimulatedWalk(simulating);
  // A simulated fix wins while the simulation runs, so the rest of the
  // component never has to know which kind it is looking at.
  const fix: Fix | null = useMemo(
    () =>
      simulating
        ? simFix
          ? { lat: simFix.lat, lng: simFix.lng, accuracy: simFix.accuracy, at: simFix.at }
          : null
        : realFix,
    [simulating, simFix, realFix],
  );

  // ---------------------------------------------------------------- map ---

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: [center.lng, center.lat],
      zoom: 15.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      const current = fixRef.current;
      map.addSource(ACCURACY_SOURCE, {
        type: "geojson",
        // A fix may already have arrived before the style finished loading.
        data: current
          ? accuracyPolygon(current.lat, current.lng, current.accuracy)
          : { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "gps-accuracy-fill",
        type: "fill",
        source: ACCURACY_SOURCE,
        paint: { "fill-color": "#5eda9b", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "gps-accuracy-line",
        type: "line",
        source: ACCURACY_SOURCE,
        paint: { "line-color": "#1e7a52", "line-width": 1, "line-opacity": 0.5 },
      });
    });

    // A dragged map means the walker wants to look around — stop chasing them.
    map.on("dragstart", () => setFollow(false));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [styleUrl, center.lat, center.lng]);

  // ---------------------------------------------------------------- gps ---

  useEffect(() => {
    if (simulating) return; // no point holding a GPS watch we are overriding
    const geo = navigator.geolocation;
    if (!geo) {
      // Reported through the same async path as every other failure, so the
      // effect never sets state during the mount commit.
      queueMicrotask(() =>
        setStatus({ kind: "error", message: "This browser has no geolocation." }),
      );
      return;
    }

    const id = geo.watchPosition(
      (pos) => {
        setRealFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        });
        setStatus({ kind: "tracking" });
      },
      (err) => setStatus({ kind: "error", ...describeError(err) }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    return () => geo.clearWatch(id);
  }, [simulating]);

  // ------------------------------------------------------- draw the fix ---

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;

    fixRef.current = fix;

    // The marker is a DOM overlay — it needs no style, so it must not wait for
    // one. Gating this on `load` was why the dot never appeared.
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "gps-dot";
      el.setAttribute("aria-hidden", "true");
      markerRef.current = new Marker({ element: el }).setLngLat([fix.lng, fix.lat]).addTo(map);
    } else {
      markerRef.current.setLngLat([fix.lng, fix.lat]);
    }

    // The accuracy ring is a style layer, so it can only be filled once the
    // source exists. Until then the load handler seeds it from fixRef.
    const source = map.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined;
    source?.setData(accuracyPolygon(fix.lat, fix.lng, fix.accuracy));

    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      map.easeTo({ center: [fix.lng, fix.lat], zoom: 17, duration: 900 });
    } else if (follow) {
      map.easeTo({ center: [fix.lng, fix.lat], duration: 600 });
    }
  }, [fix, follow]);

  /** Switching source of truth re-centres on the next fix. */
  const toggleSimulation = useCallback(() => {
    hasCenteredRef.current = false;
    setFollow(true);
    setSimulating((on) => !on);
  }, []);

  const recentre = useCallback(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    setFollow(true);
    map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 17), duration: 600 });
  }, [fix]);

  // --------------------------------------------------------------- view ---

  const quality = fix ? (fix.accuracy < 15 ? "Good" : fix.accuracy < 40 ? "Fair" : "Poor") : null;

  return (
    <div className="relative h-full w-full">
      {/* Sized, not inset: maplibre-gl.css forces `position: relative` on its
          own container, which cancels `absolute inset-0` and leaves it 0 tall. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Lifted clear of MapLibre's scale bar and attribution, which sit at the
          bottom edge and must stay legible — Stadia and OSM both require it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-[calc(2rem+max(0.5rem,env(safe-area-inset-bottom)))]">
        <div className="pointer-events-auto mx-auto flex w-full max-w-md items-end justify-between gap-3">
          <div className="panel-dark min-w-0 flex-1 px-4 py-3">
            {simulating ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="tag">Simulated walk</span>
                  <p className="text-[length:var(--text-caption)] tabular-nums text-[color:var(--on-dark-mute)]">
                    {simFix ? `${Math.round(simFix.progress * 100)}%` : "starting…"}
                    {simFix?.done ? " · finished" : ""}
                  </p>
                </div>
                <p className="mt-2 truncate font-[family-name:var(--font-display)] tabular-nums">
                  {fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : "…"}
                </p>
                <button
                  type="button"
                  onClick={toggleSimulation}
                  className="btn btn--quiet mt-3 w-full"
                >
                  Stop simulating
                </button>
              </>
            ) : status.kind === "error" ? (
              <>
                <p className="font-[family-name:var(--font-display)] font-semibold">
                  {status.message}
                </p>
                {status.hint ? (
                  <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--on-dark-mute)]">
                    {status.hint}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={toggleSimulation}
                  className="btn btn--primary mt-3 w-full"
                >
                  Simulate a walk instead
                </button>
              </>
            ) : fix ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="u-eyebrow" style={{ color: "var(--on-dark-mute)" }}>
                    Your location
                  </p>
                  <p className="text-[length:var(--text-caption)] tabular-nums text-[color:var(--on-dark-mute)]">
                    ±{Math.round(fix.accuracy)} m · {quality}
                  </p>
                </div>
                <p className="mt-1 truncate font-[family-name:var(--font-display)] tabular-nums">
                  {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
                </p>
              </>
            ) : (
              <p className="font-[family-name:var(--font-display)]">Finding you…</p>
            )}
          </div>

          <button
            type="button"
            onClick={recentre}
            disabled={!fix}
            className="btn btn--primary shrink-0"
            aria-label="Centre the map on your location"
          >
            {follow ? "Centred" : "Recentre"}
          </button>
        </div>
      </div>

      {/* Mint dot on a white ring, so it holds up against any basemap. */}
      <style>{`
        .gps-dot {
          position: relative;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #5eda9b;
          border: 3px solid #ffffff;
          box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.35), 0 2px 6px rgba(17, 24, 39, 0.4);
        }
        .gps-dot::after {
          content: "";
          position: absolute;
          inset: -9px;
          border-radius: 999px;
          border: 2px solid #5eda9b;
          animation: gps-pulse 2.4s ease-out infinite;
        }
        @keyframes gps-pulse {
          0%   { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gps-dot::after { animation: none; opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
