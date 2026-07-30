"use client";

/**
 * Step 4: making your personal tour.
 *
 * The status lines come from the server as each stage actually begins, so they
 * are true. Truth alone is not enough though — thirty to sixty seconds of a
 * still screen reads as crashed, so the step that is running lights a word at a
 * time, counts, and the line beneath it trickles toward the next one.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/ui";

/** How long each word waits before the next one lights. */
const WORD_MS = 150;
/** How long the whole lit line holds before it all goes dark together. */
const HOLD_MS = 550;

const onMotionChange = (cb: () => void) => {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

/**
 * The line that is working, lit a word at a time.
 *
 * A spinner says "something is happening"; this says "these words are the
 * thing that is happening", which is worth more on a screen somebody stares at
 * for a minute. The words light left to right, hold whole for a beat, and then
 * all go out at once — the darkness is what makes it read as a wave rather
 * than a row of independently blinking lights.
 *
 * Driven from a timer rather than staggered CSS delays because the switch-off
 * has to be simultaneous: with per-word delays each word would also switch off
 * on its own schedule, and the line would ripple out instead of dropping.
 */
function WordWave({ text }: { text: string }) {
  const words = text.split(" ");
  const still = useSyncExternalStore(
    onMotionChange,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (still) return;
    let index = 0;
    const tick = () => {
      index = index > words.length ? 0 : index + 1;
      setLit(index);
      // The pause belongs to the full line, so the eye has time to read it
      // before the line goes dark.
      return index > words.length ? HOLD_MS : WORD_MS;
    };
    let timer = window.setTimeout(function run() {
      const next = tick();
      timer = window.setTimeout(run, next);
    }, WORD_MS);
    return () => window.clearTimeout(timer);
  }, [still, words.length]);

  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          className={[
            "transition-colors duration-200",
            // `--mint-ink`, not `--mint`: the signature green as *text* on
            // white is 1.75:1 and vanishes in daylight. This is the darker one
            // the palette keeps for exactly this, at 5.3:1.
            still || i < lit ? "text-[color:var(--mint-ink)]" : "text-[color:var(--line-strong)]",
          ].join(" ")}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/**
 * Three steps on screen, six reported by the server.
 *
 * Finding the stops on the map, ordering them into a walk and routing between
 * them are all the same wait to the person waiting: the map work. As rows of
 * their own they were three lines ticking past too quickly to read, which made
 * a minute look busier than it was without making it shorter. They still
 * arrive — each one sends a line of its own, and that shows under the step it
 * belongs to, so nothing is hidden, only stacked.
 */
export const PHASE_LABELS: { key: string; label: string; covers: string[] }[] = [
  { key: "stops", label: "Choosing your stops", covers: ["stops", "locating", "ordering", "route"] },
  { key: "writing", label: "Writing the first stop", covers: ["writing"] },
  { key: "done", label: "Ready", covers: ["done"] },
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
  const t = useT();
  const activeIndex = PHASE_LABELS.findIndex((p) => p.covers.includes(phase));

  if (error) {
    return (
      <div className="flex h-full flex-col justify-center gap-5">
        <div>
          <h2 className="text-[length:var(--text-h2)]">{t("gen.failed")}</h2>
          <p className="u-measure mt-3">{error}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={onRetry} className="btn btn--primary btn--lg w-full">
            {t("gen.retry")}
          </button>
          <button type="button" onClick={onCancel} className="btn btn--quiet w-full">
            {t("gen.changeDetails")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div>
        <h2 className="text-[length:var(--text-h2)]">{t("gen.title")}</h2>
        <p className="u-measure mt-3">{t("gen.wait")}</p>
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
              <p className="spine__title">
                {working ? <WordWave key={p.key} text={p.label} /> : p.label}
              </p>
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
        {t("gen.cancel")}
      </button>
    </div>
  );
}
