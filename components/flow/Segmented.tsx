"use client";

/**
 * A row of two or three choices, one of which is always on.
 *
 * Airbnb's "Any type / Room / Entire home". It replaces a slider wherever the
 * options are few enough to name: a slider hides its other values behind a
 * drag, and three named buttons say what the whole choice is at a glance —
 * in one row rather than a label, a track and a value.
 */

export default function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="u-eyebrow">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2 flex gap-1 rounded-[var(--radius-pill)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-1"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={[
                "min-h-[40px] min-w-0 flex-1 rounded-[var(--radius-pill)] px-2 transition-colors active:scale-[0.975]",
                "font-[family-name:var(--font-display)] text-[length:var(--text-caption)]",
                // The chosen green, which is the primary button's mint with the
                // saturation taken out — one colour across the app meaning
                // "this one", and quiet enough that the button you press to
                // leave the screen still outranks it. Never green as text on
                // white: 1.75:1, unreadable in daylight.
                on
                  ? "bg-[color:var(--mint-soft)] font-semibold text-[color:var(--ink)]"
                  : "font-medium text-[color:var(--ink-soft)]",
              ].join(" ")}
            >
              <span className="block truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
