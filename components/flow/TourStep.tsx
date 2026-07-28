"use client";

/**
 * Step 6: the tour.
 *
 * The map is the screen. Everything else is an overlay: directions behind the
 * icon top right, and "Ask anything" as a collapsed row at the bottom that
 * opens into a conversation.
 */

import { useEffect, useRef, useState } from "react";
import type { Stop, TourPlan } from "@/lib/providers/types";

type QA = { question: string; answer: string | null; failed?: boolean };

export function DirectionsPanel({
  stop,
  distanceMeters,
  open,
  onClose,
  onSpeak,
}: {
  stop: Stop | null;
  distanceMeters: number | null;
  open: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}) {
  if (!open || !stop) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-lg p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="panel-dark p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="u-eyebrow" style={{ color: "var(--on-dark-mute)" }}>
              Next: {stop.name}
            </p>
            {distanceMeters !== null ? (
              <p className="mt-1 text-[length:var(--text-caption)] tabular-nums text-[color:var(--on-dark-mute)]">
                {distanceMeters < 1000
                  ? `${Math.round(distanceMeters)} m away`
                  : `${(distanceMeters / 1000).toFixed(1)} km away`}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="btn btn--quiet shrink-0 px-4" aria-label="Close directions">
            ✕
          </button>
        </div>

        {/* Large, because this is read while walking. */}
        <p className="mt-4 text-[length:var(--text-lead)] leading-relaxed">
          {stop.walkingCueToHere}
        </p>

        <button
          type="button"
          onClick={() => onSpeak(stop.walkingCueToHere)}
          className="btn btn--primary mt-5 w-full"
        >
          Repeat directions
        </button>
      </div>
    </div>
  );
}

export default function TourStep({
  plan,
  currentIndex,
  onPrev,
  onNext,
  onAsk,
  expanded,
  onToggleExpand,
}: {
  plan: TourPlan;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onAsk: (question: string) => Promise<string>;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const stop = plan.stops[currentIndex];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setThread((t) => [...t, { question: q, answer: null }]);
    setBusy(true);
    try {
      const answer = await onAsk(q);
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x)));
    } catch (err) {
      setThread((t) =>
        t.map((x, i) =>
          i === t.length - 1
            ? { ...x, answer: err instanceof Error ? err.message : "Could not answer.", failed: true }
            : x,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex <= 0}
          className="btn btn--quiet shrink-0 px-4"
          aria-label="Previous stop"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--canvas)] px-4 py-3 text-left"
        >
          <span className="block truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
            Ask anything
          </span>
          <span className="block truncate text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Stop {currentIndex + 1} of {plan.stops.length} · {stop?.name}
          </span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={currentIndex >= plan.stops.length - 1}
          className="btn btn--primary shrink-0 px-4"
          aria-label="Next stop"
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.length === 0 ? (
          <div className="text-[color:var(--ink-soft)]">
            <p className="u-measure">
              Ask about what you are looking at — who built it, what happened here, whether it is
              worth going inside.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {[
                "What am I looking at?",
                "Who built this and when?",
                "Is it worth going inside?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] px-4 py-3 text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {thread.map((qa, i) => (
              <li key={i}>
                <p className="font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                  {qa.question}
                </p>
                <p
                  className={`mt-2 ${qa.failed ? "text-[color:var(--danger)]" : "text-[color:var(--ink-soft)]"}`}
                >
                  {qa.answer ?? "Thinking…"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything"
          aria-label="Ask anything"
          className="min-h-[48px] min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[length:var(--text-body)] text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        <button type="submit" disabled={busy || !question.trim()} className="btn btn--primary shrink-0">
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
