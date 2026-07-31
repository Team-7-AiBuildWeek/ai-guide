"use client";

/**
 * The expanded player.
 *
 * Play/pause and where you are in the stop. There used to be a short/full
 * toggle here, and a voice chooser next to it; every stop is four to five
 * minutes now, and the voice is the guide's unless hers could not be made, so
 * there is nothing to choose between in either case.
 *
 * Nothing here plays by itself. Arriving at a stop loads it and stops there —
 * the narration waits for the button.
 *
 * The scrubber shows two things at once: how far the walker has listened, and
 * how much of the narration has actually been recorded. Narration is
 * synthesised while it plays, so the second bar is genuinely behind the end of
 * the track — pretending otherwise would make a seek past it look broken.
 */

import { useEffect, useRef, useState } from "react";
import StopPhoto from "./StopPhoto";

/**
 * The line being spoken, with the word the guide is on marked.
 *
 * The vendor gives no word timings, so the position within the line is where
 * the voice is in it, spread evenly across its words. Speech is close enough to
 * a constant rate over a sentence or two that this lands within a word or so —
 * near enough to follow, and the reason the whole line stays legible rather
 * than only the marked word.
 */
function SpokenLine({ text, progress }: { text: string; progress: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const at = Math.min(words.length - 1, Math.floor(progress * words.length));
  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          // Colour only. Padding, weight or size on the marked word would
          // change its width, which pushes every word after it along and
          // rewraps the paragraph — text that walks across the screen as it is
          // read is harder to follow than no mark at all.
          className={
            i === at
              ? "rounded-[2px] bg-[color:var(--mint-wash)] text-[color:var(--mint-ink)]"
              : i < at
                ? "text-[color:var(--ink)]"
                : "text-[color:var(--ink-soft)]"
          }
        >
          {word}{" "}
        </span>
      ))}
    </>
  );
}

function mmss(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function Player({
  stopName,
  index,
  total,
  playing,
  preparing,
  waitingFor,
  buffered,
  failed,
  held,
  failReason,
  failedPart,
  usingDeviceVoice,
  photo,
  speedrun,
  onSpeedrun,
  chunks,
  chunkIndex,
  chunkStart,
  chunkDuration,
  position,
  duration,
  onToggle,
  onSeek,
  onRetry,
}: {
  stopName: string;
  index: number;
  total: number;
  playing: boolean;
  preparing: boolean;
  /** What is being waited for, when something is. */
  waitingFor: string | null;
  /** How much of this stop has been recorded, 0–1. */
  buffered: number;
  failed: boolean;
  /** Held back by the rate-limit brake — deliberate, not a fault. */
  held: boolean;
  /** Why, in the provider's own words. */
  failReason: string | null;
  /** Which half broke — the words or the voice. */
  failedPart: "script" | "voice";
  /** The phone is reading, because the guide's voice could not be made. */
  usingDeviceVoice: boolean;
  /** Where this stop is, so its photograph can be found. */
  photo: { name: string; localName?: string; lat: number; lng: number; lang: string };
  /** Only the opening of each stop, then walk on. */
  speedrun: boolean;
  onSpeedrun: (on: boolean) => void;
  /** The narration, in the pieces it is spoken in. */
  chunks: string[];
  /** Which of them is sounding now. */
  chunkIndex: number;
  /** Where that piece starts in the stop, and how long it runs. */
  chunkStart: number;
  chunkDuration: number;
  position: number;
  duration: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onRetry: () => void;
}) {
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  /** How far through the piece being spoken, 0–1. */
  const within =
    chunkDuration > 0 ? Math.max(0, Math.min(1, (position - chunkStart) / chunkDuration)) : 0;

  /** Where the finger is, while it is on the scrubber. Null the rest of the time. */
  const [scrub, setScrub] = useState<number | null>(null);
  const commitScrub = () => {
    if (scrub === null) return;
    onSeek(scrub);
    setScrub(null);
  };

  /**
   * The line being spoken is kept in view as the narration moves.
   *
   * `nearest` rather than `center`: it only scrolls when the line has actually
   * left the window, so a walker reading ahead is not dragged back every
   * twenty seconds.
   */
  const spoken = useRef<HTMLParagraphElement>(null);
  /** Off by default: this is a walking tour, and the words are the fallback. */
  const [showText, setShowText] = useState(false);
  useEffect(() => {
    if (playing && showText) {
      spoken.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [chunkIndex, playing, showText]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* The barrier. Said plainly and without alarm, because nothing is
          wrong: the stop is on the map and in the route, it simply was not
          written. Anyone who did not set the flag should still understand
          what they are looking at. */}
      {held ? (
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Not written — only the first stop is generated while the rate-limit
          brake is on.
        </p>
      ) : null}
      {/* The reason matters: a spent daily quota is fixed by enabling billing,
          a busy model by waiting a minute, and a failed script is not about
          the voice at all. "Unavailable" sent people to the wrong place. */}
      {usingDeviceVoice && !held ? (
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Read by your phone —{" "}
          {failReason ?? (failedPart === "script" ? "this stop could not be written." : "the guide's voice was unavailable.")}
        </p>
      ) : null}
      <StopPhoto {...photo} />

      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
          {stopName}
        </p>
        <p className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          {index + 1} / {total}
        </p>
      </div>

      {/* Scrubber. A range input rather than a bar, because a walker who
          missed a sentence wants to go back ten seconds, not restart.

          It is drawn for the phone's voice too, and does nothing there:
          `speechSynthesis` reports neither a position nor a length, so there
          is nothing to fill it with. Present and inert rather than absent,
          because a control that comes and goes with a setting is harder to
          learn than one that is always where you left it. */}
      <div>
        {/* The recorded-so-far bar sits behind the handle. Two pixels of grey
            is enough to explain why the end of the track is not reachable yet
            without adding a second control to read. */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[color:var(--line)]"
          >
            <div
              className="h-full rounded-full bg-[color:var(--line-strong)] transition-[width] duration-700"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, buffered)) * 100)}%` }}
            />
          </div>
          {/**
           * While a thumb is on it, the scrubber shows where the thumb is
           * rather than where the audio is.
           *
           * Bound straight to `position` it fought the finger: the engine only
           * reports a new position once the seek has actually landed, and a
           * seek into a piece that has not been synthesised yet does not land
           * at all until it arrives — so the thumb sprang back and the control
           * looked broken. The seek is sent on release; the scrub is the
           * walker's until then.
           */}
          <input
            data-owns-touch
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.5}
            value={scrub ?? Math.min(position, duration || 0)}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={commitScrub}
            onPointerCancel={commitScrub}
            onTouchEnd={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            disabled={duration <= 0}
            aria-label="Position in this stop"
            className="relative h-6 w-full accent-[color:var(--mint-ink)]"
            style={{ background: "transparent" }}
          />
        </div>
        <div className="-mt-1 flex justify-between text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          <span>{mmss(scrub ?? position)}</span>
          {/* The right-hand figure is the total, or — while there is not one
              yet — what is being waited for. It reads better here than on the
              button, which wrapped "Writing this stop" onto three lines. */}
          <span>{preparing && waitingFor ? waitingFor : duration > 0 ? mmss(duration) : "—"}</span>
        </div>
        <div className="sr-only" aria-live="polite">
          {Math.round(pct)}% through {stopName}
        </div>
      </div>

      {failed && !usingDeviceVoice ? (
        <button type="button" onClick={onRetry} className="btn btn--quiet w-full">
          Narration failed — try again
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, position - 15))}
            className="btn btn--quiet shrink-0 px-4"
            aria-label="Back fifteen seconds"
          >
            −15
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="btn btn--primary min-w-0 flex-1"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(duration, position + 15))}
            className="btn btn--quiet shrink-0 px-4"
            aria-label="Forward fifteen seconds"
          >
            +15
          </button>
        </div>
      )}

      {/* Two ways to spend less on a stop: read it instead of hearing it, or
          hear only the start of it. Both are choices about time, so they share
          a row — and both stay shut until asked for, because a walking tour
          that fills the screen with text is asking to be looked at rather than
          walked. */}
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={showText}
          aria-expanded={showText}
          aria-controls="narration-text"
          onClick={() => setShowText((v) => !v)}
          disabled={chunks.length === 0}
          className={`btn min-w-0 flex-1 ${showText ? "btn--dark" : "btn--quiet"}`}
        >
          {showText ? "Hide the text" : "Read along"}
        </button>
        <button
          type="button"
          aria-pressed={speedrun}
          onClick={() => onSpeedrun(!speedrun)}
          className={`btn min-w-0 flex-1 ${speedrun ? "btn--dark" : "btn--quiet"}`}
        >
          Quick summary
        </button>
      </div>

      {/* What is being said, as it is said. There are no word timings, so the
          unit is the piece the voice is speaking — which is split at sentence
          ends, and is the smallest honest granularity available. */}
      {showText && chunks.length > 0 ? (
        <div
          id="narration-text"
          className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-3"
        >
          <p className="u-eyebrow">{speedrun ? "Quick summary" : "What you are hearing"}</p>
          <div className="mt-2 flex flex-col gap-3">
            {(speedrun ? chunks.slice(0, 1) : chunks).map((text, i) => {
              const now = i === chunkIndex;
              return (
                <p
                  key={i}
                  ref={now ? spoken : undefined}
                  className={[
                    "text-[length:var(--text-body)] leading-relaxed",
                    now
                      ? ""
                      : i < chunkIndex
                        ? "text-[color:var(--ink-mute)]"
                        : "text-[color:var(--ink-soft)]",
                  ].join(" ")}
                >
                  {now ? <SpokenLine text={text} progress={within} /> : text}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}

    </div>
  );
}
