"use client";

/**
 * The expanded player.
 *
 * Play/pause, where you are in the stop, and which voice reads it. There used
 * to be a short/full toggle here; every stop is four to five minutes now, so
 * there is nothing to choose between.
 *
 * The scrubber shows two things at once: how far the walker has listened, and
 * how much of the narration has actually been recorded. Narration is
 * synthesised while it plays, so the second bar is genuinely behind the end of
 * the track — pretending otherwise would make a seek past it look broken.
 */

import { useEffect, useRef } from "react";
import type { VoiceMode } from "@/lib/audio/useTourAudio";

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
  failReason,
  failedPart,
  usingDeviceVoice,
  voiceMode,
  onVoiceMode,
  speedrun,
  onSpeedrun,
  chunks,
  chunkIndex,
  position,
  duration,
  onToggle,
  onPrev,
  onNext,
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
  /** Why, in the provider's own words. */
  failReason: string | null;
  /** Which half broke — the words or the voice. */
  failedPart: "script" | "voice";
  /** The phone is reading — chosen, or because synthesis was unavailable. */
  usingDeviceVoice: boolean;
  voiceMode: VoiceMode;
  onVoiceMode: (m: VoiceMode) => void;
  /** Only the opening of each stop, then walk on. */
  speedrun: boolean;
  onSpeedrun: (on: boolean) => void;
  /** The narration, in the pieces it is spoken in. */
  chunks: string[];
  /** Which of them is sounding now. */
  chunkIndex: number;
  position: number;
  duration: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onRetry: () => void;
}) {
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  /**
   * The line being spoken is kept in view as the narration moves.
   *
   * `nearest` rather than `center`: it only scrolls when the line has actually
   * left the window, so a walker reading ahead is not dragged back every
   * twenty seconds.
   */
  const spoken = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (playing) spoken.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chunkIndex, playing]);

  return (
    <div className="flex flex-col gap-3">
      {/* The reason matters: a spent daily quota is fixed by enabling billing,
          a busy model by waiting a minute, and a failed script is not about
          the voice at all. "Unavailable" sent people to the wrong place. */}
      {usingDeviceVoice && voiceMode !== "device" ? (
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Read by your phone —{" "}
          {failReason ?? (failedPart === "script" ? "this stop could not be written." : "the Gemini voice was unavailable.")}
        </p>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
          {stopName}
        </p>
        <p className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          {index + 1} / {total}
        </p>
      </div>

      {/* Scrubber. A range input rather than a bar, because a walker who
          missed a sentence wants to go back ten seconds, not restart. */}
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
          <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={Math.min(position, duration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={duration <= 0}
          aria-label="Position in this stop"
          className="relative h-6 w-full accent-[color:var(--mint-ink)]"
          style={{ background: "transparent" }}
        />
        </div>
        <div className="-mt-1 flex justify-between text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          <span>{mmss(position)}</span>
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
            onClick={onPrev}
            disabled={index <= 0}
            className="btn btn--quiet shrink-0 px-4"
            aria-label="Previous stop"
          >
            ‹‹
          </button>
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
            onClick={onNext}
            disabled={index >= total - 1}
            className="btn btn--quiet shrink-0 px-4"
            aria-label="Next stop"
          >
            ››
          </button>
        </div>
      )}

      {/* The short way round. A walker with an hour and thirteen stops does
          not have four minutes for each of them, and would rather have the
          first thing the guide says about all thirteen than all of the first
          three. */}
      <button
        type="button"
        aria-pressed={speedrun}
        onClick={() => onSpeedrun(!speedrun)}
        className={`btn w-full ${speedrun ? "btn--dark" : "btn--quiet"}`}
      >
        {speedrun ? "TLDR — on, one minute a stop" : "TLDR — just the gist of each stop"}
      </button>

      {/* What is being said, as it is said. There are no word timings, so the
          unit is the piece the voice is speaking — which is split at sentence
          ends, and is the smallest honest granularity available. */}
      {chunks.length > 0 ? (
        <div className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] p-4">
          <p className="u-eyebrow">
            {speedrun ? "The gist" : "What you are hearing"}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {(speedrun ? chunks.slice(0, 1) : chunks).map((text, i) => {
              const now = i === chunkIndex;
              return (
                <p
                  key={i}
                  ref={now ? spoken : undefined}
                  className={[
                    "text-[length:var(--text-body)] leading-relaxed transition-colors",
                    now
                      ? "font-medium text-[color:var(--ink)]"
                      : i < chunkIndex
                        ? "text-[color:var(--ink-mute)]"
                        : "text-[color:var(--ink-soft)]",
                  ].join(" ")}
                >
                  {text}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Which voice reads the tour. Gemini bills per stop and a tour is a
          dozen calls, so testing runs on the phone's free voice. Remove this
          control once the narration is settled — it is scaffolding. */}
      <div
        role="group"
        aria-label="Which voice reads the tour"
        className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-dashed border-[color:var(--line-strong)] px-3 py-2"
      >
        <span className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Voice
        </span>
        <div className="flex gap-1">
          {(
            [
              ["device", "Free"],
              ["gemini", "Gemini"],
            ] as [VoiceMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={voiceMode === mode}
              onClick={() => onVoiceMode(mode)}
              className={[
                "min-h-[44px] rounded-[3px] px-3 font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-semibold",
                voiceMode === mode
                  ? "bg-[color:var(--ink)] text-[color:var(--on-dark)]"
                  : "text-[color:var(--ink-soft)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
