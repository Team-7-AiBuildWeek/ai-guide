"use client";

import { useEffect, useRef, useState } from "react";
import type { MapStyle } from "@/lib/providers/types";
import DirectionsMorph from "./DirectionsMorph";

/**
 * Basemap switcher.
 *
 * The button grows into the list (DirectionsMorph, from the top-left corner):
 * one surface, light glass like the back button while closed, turning into the
 * dark menu as it opens, and shrinking back into the button on a choice, a tap
 * elsewhere, or Escape.
 */
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (styles.length < 2) return null;

  return (
    <div ref={rootRef}>
      <DirectionsMorph
        open={open}
        onToggle={() => setOpen((o) => !o)}
        triggerLabel={open ? "Close the map layers" : "Change the map layer"}
        closedRadius={24}
        from="left"
        light
        fitMenu
        trigger={
          <span className="grid h-12 w-12 place-items-center">
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
          </span>
        }
      >
        {/* p-1.5 against a --radius-card item is deliberate: the panel is 22px,
            so an inner corner of 22 − 6 sits concentric inside it. */}
        <ul className="min-w-40 p-1.5">
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
                  "block w-full rounded-[var(--radius-card)] px-4 py-2 text-left font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-semibold",
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
      </DirectionsMorph>
    </div>
  );
}
