"use client";

/**
 * Step 3: where you start, and optionally where you finish.
 *
 * Three ways to set a point, because outdoors any one of them can fail: type
 * it, use GPS, or tap the map. The end point stays behind a link — most people
 * want a loop and should not have to say so.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/providers/types";
import type { Draft, Point } from "@/lib/tour/flow";
import type { Fix } from "@/lib/tour/useLiveLocation";

type Target = "start" | "end";

/** Hoisted: a component declared inside another is a new type every render. */
function PointRow({
  t,
  point,
  hasFix,
  onUseLocation,
  onClear,
}: {
  t: Target;
  point: Point | null;
  hasFix: boolean;
  onUseLocation: () => void;
  onClear: () => void;
}) {
  const label = t === "start" ? "Starting point" : "End point";
  return (
    <div className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="u-eyebrow">{label}</p>
          <p className="mt-1 truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
            {point?.label ?? "Not set"}
          </p>
        </div>
        {/* GPS sits with the point it fills in. At the bottom of the sheet it
            applied to whichever row was selected, which is one thing too many
            to remember while standing in the street. */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onUseLocation}
            disabled={!hasFix}
            aria-label={`Use my location as the ${label.toLowerCase()}`}
            className="btn btn--quiet px-4"
            style={{ minHeight: 44 }}
          >
            {hasFix ? "Use my location" : "Locating…"}
          </button>
          {point ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[length:var(--text-caption)] font-semibold text-[color:var(--mint-ink)] underline underline-offset-4"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      {/* Full width, below the button: sharing the line with it wrapped the
          longitude onto its own row. */}
      {point ? (
        <p className="mt-1 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}

export default function PointsStep({
  draft,
  onChange,
  onContinue,
  fix,
  picking,
  setPicking,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onContinue: () => void;
  fix: Fix | null;
  picking: Target | null;
  setPicking: (t: Target | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<Target>("start");
  const [showEnd, setShowEnd] = useState(false);
  const debounce = useRef<number | null>(null);

  // Debounced hard: Nominatim's policy is one request a second, and typing a
  // street name is eight keystrokes.
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    // Short queries simply do not search; `visibleResults` below hides any
    // stale list, so nothing has to be cleared from inside the effect.
    if (query.trim().length < 2) return;
    debounce.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
        const body = (await res.json()) as { places?: Place[] };
        setResults(body.places ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query]);

  const setPoint = useCallback(
    (t: Target, p: Point | null) => {
      onChange(t === "start" ? { start: p } : { end: p });
      setQuery("");
      setResults([]);
      setPicking(null);
    },
    [onChange, setPicking],
  );

  const useMyLocation = (t: Target) => {
    if (!fix) return;
    setPoint(t, { lat: fix.lat, lng: fix.lng, label: "Where I am now" });
  };

  // Stale results stay in state but are never shown for a too-short query.
  const visibleResults = query.trim().length >= 2 ? results : [];

  return (
    <div className="flex flex-col gap-5">
      <PointRow
        t="start"
        point={draft.start}
        hasFix={fix !== null}
        onUseLocation={() => useMyLocation("start")}
        onClear={() => setPoint("start", null)}
      />
      {showEnd || draft.end ? (
        <PointRow
          t="end"
          point={draft.end}
          hasFix={fix !== null}
          onUseLocation={() => useMyLocation("end")}
          onClear={() => setPoint("end", null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowEnd(true);
            setTarget("end");
          }}
          className="min-h-[44px] text-left font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
        >
          Choose where to finish (optional)
        </button>
      )}

      {/* Which point the controls below apply to. */}
      {showEnd || draft.end ? (
        <div className="flex gap-2">
          {(["start", "end"] as Target[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={target === t}
              onClick={() => setTarget(t)}
              className={`btn flex-1 ${target === t ? "btn--dark" : "btn--quiet"}`}
            >
              Set {t === "start" ? "start" : "end"}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <label htmlFor="place" className="u-eyebrow">
          Type a place
        </label>
        <input
          id="place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Michalská brána"
          autoComplete="off"
          className="mt-2 min-h-[48px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[length:var(--text-body)] text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        {searching ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Searching…
          </p>
        ) : null}
        {visibleResults.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {visibleResults.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPoint(target, { lat: p.lat, lng: p.lng, label: p.name })}
                  className="w-full rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-left hover:border-[color:var(--ink-mute)]"
                >
                  <span className="block font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                    {p.name}
                  </span>
                  <span className="block truncate text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
                    {p.address}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setPicking(picking ? null : target)}
        className={`btn w-full ${picking ? "btn--dark" : "btn--quiet"}`}
      >
        {picking ? "Tap the map…" : "Drop a pin"}
      </button>
      {picking ? (
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          The sheet is out of the way — tap anywhere on the map to place the{" "}
          {picking === "start" ? "start" : "end"} point.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        disabled={!draft.start}
        className="btn btn--primary btn--lg w-full"
      >
        Create my tour
      </button>
      {!draft.start ? (
        <p className="-mt-2 text-center text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          A starting point is needed first.
        </p>
      ) : null}
    </div>
  );
}
