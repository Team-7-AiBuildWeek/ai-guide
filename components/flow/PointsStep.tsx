"use client";

/**
 * Step 3: where you start, and optionally where you finish.
 *
 * Three ways to set a point, because outdoors any one of them can fail: type
 * it, use GPS, or tap the map. All three live inside the box for the point
 * they fill — there used to be one search field and one "drop a pin" button
 * further down the sheet, applying to whichever of the two was selected by a
 * pair of toggle buttons, and nothing on screen said which that was while you
 * were typing.
 *
 * The end point stays behind a link — most people want a loop and should not
 * have to say so — which also means only one search field exists until someone
 * asks for a second.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { City, Place } from "@/lib/providers/types";
import type { Draft, Point } from "@/lib/tour/flow";
import type { Fix } from "@/lib/tour/useLiveLocation";
import { distanceMeters } from "@/lib/tour/route";
import { useT } from "@/lib/i18n/ui";
import CityPicker from "./CityPicker";

type Target = "start" | "end";

/** Past this from the chosen city, a GPS fix is somewhere else entirely. */
const CITY_RADIUS_M = 30_000;

/** Hoisted: a component declared inside another is a new type every render. */
function PointRow({
  t,
  point,
  hasFix,
  cityName,
  query,
  onQuery,
  searching,
  results,
  onPick,
  onDropPin,
  onUseLocation,
  onClear,
}: {
  t: Target;
  point: Point | null;
  hasFix: boolean;
  cityName?: string;
  /** Empty unless this row is the one being typed into. */
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
  results: Place[];
  onPick: (p: Place) => void;
  onDropPin: () => void;
  onUseLocation: () => void;
  onClear: () => void;
}) {
  const tr = useT();
  const label = t === "start" ? tr("points.start") : tr("points.end");
  const inputId = `place-${t}`;

  return (
    <div className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="u-eyebrow">{label}</p>
          <p className="mt-1 truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
            {point?.label ?? tr("points.notSet")}
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
            {hasFix ? tr("points.useLocation") : tr("points.locating")}
          </button>
          {point ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[length:var(--text-caption)] font-semibold text-[color:var(--mint-ink)] underline underline-offset-4"
            >
              {tr("points.clear")}
            </button>
          ) : null}
        </div>
      </div>
      {/* No latitude and longitude under the name. Five decimal places of it
          answered a question nobody standing in a street asks, and under "Where
          I am now" it read as something to check rather than something already
          done. The label says what the point is in all three cases: a place has
          its name, a dropped pin carries its coordinates in the label itself,
          and the GPS one says where you are. */}

      {/* The pin sits on the field, because it answers the same question by
          other means: "somewhere I cannot name". A full-width button below the
          field read as a third, separate thing to understand. */}
      <div className="mt-2 flex items-center gap-2">
        <input
          id={inputId}
          aria-label={`Search for ${t === "start" ? "a starting point" : "an end point"}`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={
            cityName
              ? `Search ${cityName} for ${t === "start" ? "a start" : "an end"}`
              : `Search for ${t === "start" ? "a start" : "an end"}`
          }
          autoComplete="off"
          className="min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[length:var(--text-body)] text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        <button
          type="button"
          onClick={onDropPin}
          aria-label={`Drop a pin on the map for the ${label.toLowerCase()}`}
          title="Drop a pin on the map"
          className="btn btn--quiet btn--icon shrink-0"
          style={{ minHeight: 44 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>

      {/* The list hangs off the field that produced it, inside the box it
          fills. It is the whole point of the arrangement. */}
      {searching ? (
        <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {tr("points.searching")}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
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
  );
}

/**
 * The same footer as the brief step: the button across the whole width with
 * the state of the choice written above it. Rendered by the sheet, below the
 * scroll box — see BriefFooter for why it is not sticky.
 *
 * The line above is the reason the button is sometimes dead: "Set a starting
 * point" sits directly over it rather than off to one side, where a disabled
 * button looked broken instead of waiting.
 */
export function PointsFooter({
  draft,
  onContinue,
}: {
  draft: Draft;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-stretch gap-1">
      <p className="min-h-[24px] text-center text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
        {draft.start
          ? draft.end
            ? t("points.bothSet")
            : t("points.loop")
          : t("points.needStart")}
      </p>
      <button
        type="button"
        onClick={onContinue}
        disabled={!draft.start}
        className="btn btn--primary btn--lg w-full font-semibold"
      >
        {t("points.create")}
      </button>
    </div>
  );
}

export default function PointsStep({
  draft,
  onChange,
  fix,
  picking,
  setPicking,
  detectingCity,
  onCity,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  fix: Fix | null;
  picking: Target | null;
  setPicking: (t: Target | null) => void;
  detectingCity: boolean;
  onCity: (c: City) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  /** Which box is being typed into — one search at a time, two places to put it. */
  const [searchIn, setSearchIn] = useState<Target>("start");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const debounce = useRef<number | null>(null);
  const city = draft.city;

  /**
   * What the search ranks around.
   *
   * The GPS fix wins when it is inside the chosen city, because a walker
   * standing on one side of town wants the nearer of two streets with the same
   * name, and the city centre cannot tell them apart. It loses when the two
   * disagree — someone planning tomorrow's walk in Vienna from a sofa in
   * Bratislava means Vienna, and their own coordinates are noise.
   */
  const anchor =
    fix && (!city || distanceMeters(fix, { lat: city.lat, lng: city.lng }) < CITY_RADIUS_M)
      ? { lat: fix.lat, lng: fix.lng }
      : city
        ? { lat: city.lat, lng: city.lng }
        : null;


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
        // Ranked around where the walker actually is but not walled into it:
        // people search for a station on the edge of town, and a hard boundary
        // would hide it.
        const near = anchor ? `&nearLat=${anchor.lat}&nearLng=${anchor.lng}` : "";
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(query.trim())}${near}&lang=${encodeURIComponent(draft.lang)}`,
        );
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
    // Re-running on every GPS tick would cancel the debounce mid-type; the
    // coordinates are read when the request fires, which is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, city?.lat, city?.lng]);

  const setPoint = useCallback(
    (t: Target, p: Point | null) => {
      onChange(t === "start" ? { start: p } : { end: p });
      setQuery("");
      setResults([]);
      setPicking(null);
    },
    [onChange, setPicking],
  );

  const typeInto = useCallback((t: Target, q: string) => {
    setSearchIn(t);
    setQuery(q);
  }, []);

  // `target`, not `t`: `t` is the translator in this scope, and the label needs it.
  const fillFromLocation = (target: Target) => {
    if (!fix) return;
    // Translated, unlike before: it sits directly under a Slovak eyebrow.
    setPoint(target, { lat: fix.lat, lng: fix.lng, label: t("points.hereNow") });
  };

  // Stale results stay in state but are never shown for a too-short query.
  const visibleResults = query.trim().length >= 2 ? results : [];
  /** Everything about the search belongs to one box at a time. */
  const searchProps = (t: Target) => ({
    query: searchIn === t ? query : "",
    onQuery: (q: string) => typeInto(t, q),
    searching: searchIn === t && searching,
    results: searchIn === t ? visibleResults : [],
    onPick: (p: Place) => setPoint(t, { lat: p.lat, lng: p.lng, label: p.name }),
    onDropPin: () => setPicking(picking === t ? null : t),
  });

  return (
    <div className="flex flex-col gap-3">
      <CityPicker
        city={city}
        detecting={detectingCity}
        lang={draft.lang}
        open={cityOpen}
        onOpenChange={setCityOpen}
        onChange={onCity}
      />
      <PointRow
        t="start"
        point={draft.start}
        hasFix={fix !== null}
        cityName={city?.name}
        onUseLocation={() => fillFromLocation("start")}
        onClear={() => setPoint("start", null)}
        {...searchProps("start")}
      />
      {showEnd || draft.end ? (
        <PointRow
          t="end"
          point={draft.end}
          hasFix={fix !== null}
          cityName={city?.name}
          onUseLocation={() => fillFromLocation("end")}
          onClear={() => setPoint("end", null)}
          {...searchProps("end")}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowEnd(true)}
          className="min-h-[44px] text-left font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
        >
          {t("points.addEnd")}
        </button>
      )}

    </div>
  );
}
