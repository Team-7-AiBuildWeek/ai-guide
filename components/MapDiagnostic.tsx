"use client";

/**
 * The GPS diagnostic screen.
 *
 * Same map component as the tour, with the position readout the flow does not
 * show. Kept small on purpose: when someone says "location is broken", this is
 * the page that tells you whether it is the device, the browser, or us.
 */

import TourMap from "./TourMap";
import { useLiveLocation } from "@/lib/tour/useLiveLocation";
import { qualityWord } from "@/lib/tour/fixQuality";

export default function MapDiagnostic({
  styleUrl,
  center,
  initialSimulate = false,
}: {
  styleUrl: string;
  center: { lat: number; lng: number };
  initialSimulate?: boolean;
}) {
  const { fix, status, simulating, simFix, toggleSimulation } = useLiveLocation(initialSimulate);
  // The same thresholds the tour acts on, so this page explains the tour's
  // behaviour rather than describing a second, private idea of "good".
  const quality = fix ? qualityWord(fix.accuracy) : null;

  return (
    <div className="relative h-full w-full">
      <TourMap styleUrl={styleUrl} center={center} fix={fix} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-[calc(2rem+max(0.5rem,env(safe-area-inset-bottom)))]">
        <div className="pointer-events-auto mx-auto w-full max-w-md panel-dark px-4 py-3">
          {simulating ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="tag">Simulated walk</span>
                <span className="text-[length:var(--text-caption)] tabular-nums text-[color:var(--on-dark-mute)]">
                  {simFix ? `${Math.round(simFix.progress * 100)}%` : "starting…"}
                </span>
              </div>
              <p className="mt-2 truncate font-[family-name:var(--font-display)] tabular-nums">
                {fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : "…"}
              </p>
              <button type="button" onClick={toggleSimulation} className="btn btn--quiet mt-3 w-full">
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
              <button type="button" onClick={toggleSimulation} className="btn btn--primary mt-3 w-full">
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
      </div>
    </div>
  );
}
