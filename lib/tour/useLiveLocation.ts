"use client";

/**
 * Live position, real or simulated, behind one interface.
 *
 * Extracted so every screen in the flow shares the same watch rather than each
 * opening its own — a phone with four `watchPosition` calls running is a phone
 * with a flat battery.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSimulatedWalk } from "./useSimulatedWalk";

export type Fix = { lat: number; lng: number; accuracy: number; at: number };

export type LocationStatus =
  | { kind: "locating" }
  | { kind: "tracking" }
  | { kind: "error"; message: string; hint?: string };

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function describeGeolocationError(err: GeolocationPositionError): {
  message: string;
  hint?: string;
} {
  // Over plain http the browser refuses geolocation and reports it as a
  // permission denial, which sends you hunting for a setting that was never
  // the problem. Name the real cause first.
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
            hint: "Allow location for this site, then reload.",
          };
    case err.POSITION_UNAVAILABLE:
      // A Mac has no GPS chip — it positions by looking up nearby wifi. Wired,
      // with no wifi association, there is nothing to look up.
      return {
        message: "No position available.",
        hint: isApplePlatform()
          ? "On a Mac, join a wifi network — it locates by wifi, not GPS. On a phone, step outside."
          : "Step outside — indoors there may be no fix.",
      };
    case err.TIMEOUT:
      return { message: "Timed out waiting for a fix.", hint: "Try again outdoors." };
    default:
      return { message: err.message || "Location failed." };
  }
}

export function useLiveLocation(initialSimulate = false) {
  const [status, setStatus] = useState<LocationStatus>({ kind: "locating" });
  const [realFix, setRealFix] = useState<Fix | null>(null);
  const [simulating, setSimulating] = useState(initialSimulate);

  const simFix = useSimulatedWalk(simulating);

  useEffect(() => {
    if (simulating) return; // no point holding a watch we are overriding
    const geo = navigator.geolocation;
    if (!geo) {
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
      (err) => setStatus({ kind: "error", ...describeGeolocationError(err) }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => geo.clearWatch(id);
  }, [simulating]);

  const fix: Fix | null = useMemo(
    () =>
      simulating
        ? simFix
          ? { lat: simFix.lat, lng: simFix.lng, accuracy: simFix.accuracy, at: simFix.at }
          : null
        : realFix,
    [simulating, simFix, realFix],
  );

  const toggleSimulation = useCallback(() => setSimulating((on) => !on), []);

  return { fix, status, simulating, simFix, toggleSimulation };
}
