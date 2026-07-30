"use client";

/**
 * Live position, real or simulated, behind one interface.
 *
 * Extracted so every screen in the flow shares the same watch rather than each
 * opening its own — a phone with four `watchPosition` calls running is a phone
 * with a flat battery.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { acceptReading, smooth, type Smoothed } from "./fixQuality";
import { useSimulatedWalk } from "./useSimulatedWalk";

export type Fix = { lat: number; lng: number; accuracy: number; at: number };

export type LocationStatus =
  | { kind: "locating" }
  | { kind: "tracking" }
  | { kind: "error"; message: string; hint?: string };

/** How long a position stays worth showing after the fixes stop arriving. */
const STALE_FIX_MS = 20_000;

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

  /** The last reading we believed, and the filter state that came with it. */
  const acceptedRef = useRef<Smoothed | null>(null);

  useEffect(() => {
    if (simulating) return; // no point holding a watch we are overriding
    const geo = navigator.geolocation;
    if (!geo) {
      queueMicrotask(() =>
        setStatus({ kind: "error", message: "This browser has no geolocation." }),
      );
      return;
    }

    const onReading = (pos: GeolocationPosition) => {
      const reading = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        // The device's own clock for the reading, not ours: a fix handed over
        // late is still a fix from when it was taken.
        at: pos.timestamp,
      };
      // Only on the way in, or on a change: a fresh object every second would
      // re-render every screen holding this hook for no news.
      setStatus((s) => (s.kind === "tracking" ? s : { kind: "tracking" }));
      if (!acceptReading(acceptedRef.current, reading)) return;

      const next = smooth(acceptedRef.current, reading);
      acceptedRef.current = next;
      setRealFix({ lat: next.lat, lng: next.lng, accuracy: next.accuracy, at: next.at });
    };

    const onError = (err: GeolocationPositionError) => {
      // Walking under a bridge or into a courtyard drops fixes, and browsers
      // report the gap as a timeout or as no position at all. Replacing the
      // map with an error for that is worse than the gap itself: keep the last
      // position until it is old enough to be a lie. A refused permission is
      // the exception — that is not going to fix itself by waiting.
      const last = acceptedRef.current;
      const transient = err.code !== err.PERMISSION_DENIED;
      if (transient && last && Date.now() - last.at < STALE_FIX_MS) return;
      setStatus({ kind: "error", ...describeGeolocationError(err) });
    };

    /**
     * `maximumAge: 0` because a cached fix is how you end up standing at the
     * last place the phone was sure about — often the last building with wifi,
     * a street or two back.
     */
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    };

    // The watch alone can take several seconds to say anything. Asking once,
    // in parallel, puts a dot on the map while the GPS chip warms up — and it
    // goes through the same filter, so a coarse first answer is replaced
    // rather than believed.
    geo.getCurrentPosition(onReading, () => {}, { ...options, timeout: 10_000 });

    const id = geo.watchPosition(onReading, onError, options);
    return () => geo.clearWatch(id);
  }, [simulating]);

  // A new walk should not inherit the last one's filter state.
  useEffect(() => {
    if (simulating) acceptedRef.current = null;
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
