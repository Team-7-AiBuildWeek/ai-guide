"use client";

/**
 * Step 6: the tour.
 *
 * The map is the screen. Everything else is an overlay: directions behind the
 * icon top right, and "Ask anything" as a collapsed row at the bottom that
 * opens into a conversation.
 */

import { useEffect, useRef, useState } from "react";
import type { Stop, TourPlan, TourRide } from "@/lib/providers/types";
import { TRUSTED_M } from "@/lib/tour/fixQuality";

/** What to call each thing on the front of the vehicle. */
const RIDE_WORDS: Record<TourRide["mode"], string> = {
  tram: "Tram",
  bus: "Bus",
  trolleybus: "Trolleybus",
  subway: "Metro",
  light_rail: "Train",
};

type QA = { question: string; answer: string | null; failed?: boolean };

export function DirectionsPanel({
  stop,
  distanceMeters,
  accuracy,
  turnInstruction,
  turnMeters,
  ride,
  open,
  onClose,
  onSpeak,
}: {
  stop: Stop | null;
  distanceMeters: number | null;
  /** The current fix's radius in metres, so a bad one can say so. */
  accuracy?: number | null;
  /** The router's own words for the next turn, when the route provided them. */
  turnInstruction?: string;
  turnMeters?: number;
  /** Set when this leg is ridden rather than walked. */
  ride?: TourRide | null;
  open: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}) {
  if (!open || !stop) return null;
  const cue = stop.walkingCueToHere?.trim() ?? "";
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-lg p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="panel-dark p-4">
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
            {/* Said plainly, because "300 m away" from a fix that is itself
                150 m wide is a number worth distrusting — and because it
                explains why the tour has stopped advancing on its own. */}
            {typeof accuracy === "number" && accuracy > TRUSTED_M ? (
              <p className="mt-1 text-[length:var(--text-caption)] tabular-nums text-[color:var(--warn)]">
                Weak signal · ±{Math.round(accuracy)} m — advance by hand
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="btn btn--quiet shrink-0 px-4" aria-label="Close directions">
            ✕
          </button>
        </div>

        {/* A ridden leg, when this one is. It comes before the turn arrow and
            replaces it: the arrow is for someone walking, and pointing a
            walker down a street they are meant to cross by tram is worse than
            saying nothing. Line number first and biggest — it is what you look
            for on the front of the thing. */}
        {ride ? (
          <div className="mt-4 rounded-[var(--radius-control)] border border-[color:var(--mint)] p-3">
            <p className="text-[length:var(--text-lead)] font-semibold leading-snug">
              <span className="text-[color:var(--mint)]">
                {RIDE_WORDS[ride.mode]} {ride.ref}
              </span>{" "}
              from {ride.board.name}
            </p>
            <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--on-dark-mute)]">
              {ride.headsign ? `Towards ${ride.headsign} · ` : ""}
              {ride.stops} {ride.stops === 1 ? "stop" : "stops"} · about {ride.minutes} min
            </p>
            <p className="mt-2 text-[length:var(--text-body)] font-semibold">
              Get off at {ride.alight.name}
            </p>
            {/* Said once, plainly. The data behind this has lines and stops
                and no timetable, and a made-up departure time is worse than
                no time at all. */}
            <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--on-dark-mute)]">
              Times vary — check the stop.
            </p>
          </div>
        ) : null}

        {/* The turn first — it is the thing that expires. The guide's cue is
            the context, and it stays true for the whole leg. */}
        {!ride && turnInstruction ? (
          <p className="mt-4 text-[length:var(--text-lead)] font-semibold leading-relaxed">
            {turnInstruction}
            {typeof turnMeters === "number" && turnMeters >= 10 ? (
              <span className="text-[color:var(--mint)]"> · {Math.round(turnMeters)} m</span>
            ) : null}
          </p>
        ) : null}

        {/* Large, because this is read while walking. */}
        {/* The cue is written with the stop's narration, so early in a long
            tour it may not exist yet. The turn arrow above always does. */}
        {cue ? (
          <p
            className={`text-[length:var(--text-lead)] leading-relaxed ${turnInstruction ? "mt-3 text-[color:var(--on-dark-mute)]" : "mt-4"}`}
          >
            {cue}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() =>
            onSpeak(
              ride
                ? `Take ${RIDE_WORDS[ride.mode]} ${ride.ref} from ${ride.board.name}, ${ride.stops} stops, and get off at ${ride.alight.name}.`
                : [turnInstruction, cue].filter(Boolean).join(". ") || `Continue to ${stop.name}.`,
            )
          }
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
          <ul className="flex flex-col gap-4">
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
