"use client";

/**
 * Step 4: making your personal tour.
 *
 * The status lines come from the server as each stage actually begins, so they
 * are true. A spinner alone for 30–60 seconds reads as "hung".
 */

export const PHASE_LABELS: { key: string; label: string }[] = [
  { key: "stops", label: "Choosing your stops" },
  { key: "route", label: "Planning the walking route" },
  { key: "done", label: "Ready" },
];

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
    <div className="flex h-full flex-col justify-center gap-8">
      <div>
        <h2 className="text-[length:var(--text-h2)]">Making your personal tour…</h2>
        <p className="u-measure mt-3">
          This takes up to a minute. Keep the screen open.
        </p>
      </div>

      <ol className="spine">
        {PHASE_LABELS.map((p, i) => {
          const done = activeIndex > i;
          const current = activeIndex === i;
          return (
            <li
              key={p.key}
              className={`spine__item ${done ? "spine__item--done" : ""} ${current ? "spine__item--current" : ""}`}
            >
              <span className="spine__node" aria-hidden="true">
                {done ? "✓" : i + 1}
              </span>
              <p className="spine__title">{p.label}</p>
              {current && message ? <p className="spine__meta mt-1">{message}</p> : null}
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={onCancel} className="min-h-[44px] text-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
        Cancel
      </button>
    </div>
  );
}
