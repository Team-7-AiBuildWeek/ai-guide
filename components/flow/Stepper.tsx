"use client";

/**
 * One value, stepped up and down. Airbnb's "Bedrooms − Any +".
 *
 * For an ordered list too long to name in a row: the value is written out in
 * words between the two buttons, so there is no track and no separate read-out.
 * Both ends stop rather than wrap — a walker pressing minus past the shortest
 * walk means the shortest walk, not the longest.
 *
 * Sized to match the segmented rows below it — same track, same radius, same
 * full width — because how long the walk is decides more than any of them: it
 * sets how many stops there are and how far apart. Squeezed onto the end of
 * its own label it was the smallest control on the screen and the one worth
 * the most thought.
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
  /* 44px, the smallest thing a thumb hits reliably. It was 36. */
  const button =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-[color:var(--surface)] " +
    "text-[length:var(--text-lead)] leading-none " +
    "border-[color:var(--line-strong)] text-[color:var(--ink)] disabled:border-[color:var(--line)] " +
    "disabled:bg-transparent disabled:text-[color:var(--line-strong)] disabled:cursor-not-allowed";

  return (
    <div>
      <p className="u-eyebrow">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-pill)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-1">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={atMin}
          aria-label={`Less ${label.toLowerCase()}`}
          className={button}
        >
          −
        </button>
        {/* Takes the whole middle, so stepping between "1 hour" and "A whole
            afternoon" does not shunt the buttons sideways under the thumb. */}
        <span className="min-w-0 flex-1 truncate text-center font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
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
