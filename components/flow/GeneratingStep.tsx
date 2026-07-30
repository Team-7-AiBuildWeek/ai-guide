"use client";

/**
 * Step 4: making your personal tour.
 *
 * The status lines come from the server as each stage actually begins, so they
 * are true. Truth alone is not enough though — thirty to sixty seconds of a
 * still screen reads as crashed, so the step that is running breathes, and
 * counts, and the line beneath it trickles toward the next one.
 */

import { useEffect, useState } from "react";

export const PHASE_LABELS: { key: string; label: string }[] = [
  { key: "stops", label: "Choosing your stops" },
  { key: "locating", label: "Finding them on the map" },
  { key: "ordering", label: "Putting them in walking order" },
  { key: "route", label: "Planning the walking route" },
  { key: "writing", label: "Writing the first stop" },
  { key: "done", label: "Ready" },
];

/**
 * Seconds on the current step.
 *
 * Given `key={phase}` by the caller so it remounts when the step changes and
 * starts at zero by construction — rather than resetting state from inside an
 * effect, which is a cascading render waiting to happen.
 */
function Elapsed({ children }: { children: (seconds: number) => React.ReactNode }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{children(seconds)}</>;
}

export default function GeneratingStep({
  phase,
  message,
  error,
  onCancel,
  onRetry,
}: {
  phase: string;
  message: string | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const activeIndex = PHASE_LABELS.findIndex((p) => p.key === phase);

  if (error) {
    return (
      <div className="flex h-full flex-col justify-center gap-6">
        <div>
          <h2 className="text-[length:var(--text-h2)]">That didn&apos;t work.</h2>
          <p className="u-measure mt-3">{error}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={onRetry} className="btn btn--primary btn--lg w-full">
            Try again
          </button>
          <button type="button" onClick={onCancel} className="btn btn--quiet w-full">
            Change the details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <div>
        <h2 className="text-[length:var(--text-h2)]">Making your personal tour…</h2>
        <p className="u-measure mt-3">This takes up to a minute. Keep the screen open.</p>
      </div>

      <ol className="spine">
        {PHASE_LABELS.map((p, i) => {
          const done = activeIndex > i;
          const working = activeIndex === i;
          const pending = activeIndex < i;
          return (
            <li
              key={p.key}
              className={[
                "spine__item",
                done ? "spine__item--done" : "",
                working ? "spine__item--current spine__item--working" : "",
                pending ? "spine__item--pending" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={`spine__node${working ? " spine__node--working" : ""}`}
                aria-hidden="true"
              >
                {done ? "✓" : i + 1}
              </span>
              <p className="spine__title">{p.label}</p>
              {working ? (
                <Elapsed key={p.key}>
                  {(seconds) => {
                    // The server usually sends back the same words as the
                    // label; echoing them under it just reads as a stutter.
                    const note = message && message !== p.label ? message : null;
                    const line = [note, seconds > 2 ? `${seconds}s` : null]
                      .filter(Boolean)
                      .join(" · ");
                    return line ? <p className="spine__meta mt-1">{line}</p> : null;
                  }}
                </Elapsed>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Screen readers get the same reassurance the animation gives everyone
          else — without it, this screen announces nothing for a minute. */}
      <p className="sr-only" aria-live="polite">
        {PHASE_LABELS[activeIndex]?.label ?? "Working"}
      </p>

      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] text-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
      >
        Cancel
      </button>
    </div>
  );
}
