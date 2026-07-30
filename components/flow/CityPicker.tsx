"use client";

/**
 * Which city the walk is in.
 *
 * Normally answered before it is asked — GPS resolves to a name and this is a
 * line of text confirming it. Typing is the escape hatch for the two cases
 * that break that: planning tomorrow from a hotel room, and a fix that lands
 * in the wrong suburb.
 */

import { useEffect, useRef, useState } from "react";
import type { City } from "@/lib/providers/types";
import { searchCities } from "@/lib/tour/city";

export default function CityPicker({
  city,
  detecting,
  lang,
  open,
  onOpenChange,
  onChange,
}: {
  city: City | null;
  /** GPS has a fix and the name is still being looked up. */
  detecting: boolean;
  /** The walk's language — city names come back in it where the map has them. */
  lang: string;
  /** Controlled, so the landing screen can open straight into the search. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (c: City) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Same 600ms as the place search: Nominatim allows one request a second and
  // a city name is six keystrokes.
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (query.trim().length < 2) return;
    debounce.current = window.setTimeout(async () => {
      setSearching(true);
      setResults(await searchCities(query, lang));
      setSearching(false);
    }, 600);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query, lang]);

  const visible = query.trim().length >= 2 ? results : [];

  if (!open) {
    return (
      <div className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="u-eyebrow">City</p>
            <p className="mt-1 truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
              {city ? city.label : detecting ? "Finding you…" : "Not set"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="btn btn--quiet btn--small shrink-0"
          >
            {city ? "Change" : "Choose"}
          </button>
        </div>
        {!city && !detecting ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Type where you are and the tour is built there.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--canvas)] p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="city" className="u-eyebrow">
          Which city?
        </label>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            setQuery("");
          }}
          className="btn btn--quiet btn--small shrink-0"
        >
          Cancel
        </button>
      </div>
      <input
        id="city"
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Vienna, Kraków, Porto…"
        autoComplete="off"
        className="mt-2 min-h-[48px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[length:var(--text-body)] text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
      />
      {searching ? (
        <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Searching…
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {visible.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => {
                  onChange(c);
                  onOpenChange(false);
                  setQuery("");
                  setResults([]);
                }}
                className="w-full rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-left"
              >
                <span className="block truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                  {c.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!searching && query.trim().length >= 2 && visible.length === 0 ? (
        <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Nothing by that name. Try the local spelling.
        </p>
      ) : null}
    </div>
  );
}
