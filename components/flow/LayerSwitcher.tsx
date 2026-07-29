"use client";

/**
 * Basemap switcher.
 *
 * Satellite is the one people actually reach for on a walking tour — it
 * answers "which of these buildings is it" in a way a road map never does.
 */

import { useState } from "react";
import type { MapStyle } from "@/lib/providers/types";

export default function LayerSwitcher({
  styles,
  value,
  onChange,
}: {
  styles: MapStyle[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (styles.length < 2) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Change the map layer"
        className="btn btn--quiet btn--icon"
      >
        {/* Stacked sheets. */}
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
          <path
            d="M12 3.5 3 8l9 4.5L21 8l-9-4.5z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 12.6 12 16.8l8.5-4.2M3.5 16.6 12 20.8l8.5-4.2"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul className="panel-dark overflow-hidden p-1">
          {styles.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={value === s.id}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={[
                  "block w-full rounded-[3px] px-4 py-2 text-left font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-semibold",
                  value === s.id
                    ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                    : "text-[color:var(--on-dark)]",
                ].join(" ")}
                style={{ minHeight: 44 }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
