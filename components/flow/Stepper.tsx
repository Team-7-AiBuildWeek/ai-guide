"use client";

/**
 * One value, stepped up and down. Airbnb's "Bedrooms − Any +".
 *
 * For an ordered list too long to name in a row: the value is written out in
 * words beside the two buttons, so the whole control is one line instead of a
 * label, a track and a read-out. Both ends stop rather than wrap — a walker
 * pressing minus past the shortest walk means the shortest walk, not the
 * longest.
 */

export default function Stepper({
  label,
  value,
  atMin,
  atMax,
  onStep,
}: {
  label: string;
  /** The value in words — "45 minutes", not 45. */
  value: string;
  atMin: boolean;
  atMax: boolean;
  onStep: (direction: -1 | 1) => void;
}) {
  const button =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[length:var(--text-body)] " +
    "border-[color:var(--line-strong)] text-[color:var(--ink)] disabled:border-[color:var(--line)] " +
    "disabled:text-[color:var(--line-strong)] disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="u-eyebrow">{label}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={atMin}
          aria-label={`Less ${label.toLowerCase()}`}
          className={button}
        >
          −
        </button>
        {/* Fixed width, so stepping through "1 hour" and "A whole afternoon"
            does not shunt the buttons sideways under the thumb. */}
        <span className="min-w-[8.5rem] text-center font-[family-name:var(--font-display)] text-[length:var(--text-body)] font-semibold text-[color:var(--ink)]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={atMax}
          aria-label={`More ${label.toLowerCase()}`}
          className={button}
        >
          +
        </button>
      </div>
    </div>
  );
}
