"use client";

/**
 * The mini player.
 *
 * Visible at all times during the tour — play/pause, which stop, and the
 * short/full depth toggle. The depth control is not in a settings menu on
 * purpose: it is the one thing here no competitor has, and burying it would
 * waste it.
 */

import type { Depth } from "@/lib/audio/engine";
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
  depth,
  onDepth,
  playing,
  preparing,
  failed,
  usingDeviceVoice,
  voiceMode,
  onVoiceMode,
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
  depth: Depth;
  onDepth: (d: Depth) => void;
  playing: boolean;
  preparing: boolean;
  failed: boolean;
  /** The phone is reading — chosen, or because synthesis was unavailable. */
  usingDeviceVoice: boolean;
  voiceMode: VoiceMode;
  onVoiceMode: (m: VoiceMode) => void;
  position: number;
  duration: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onRetry: () => void;
}) {
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      {usingDeviceVoice && voiceMode !== "device" ? (
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Read by your phone — the Gemini voice was unavailable.
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
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={Math.min(position, duration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={duration <= 0}
          aria-label="Position in this stop"
          className="h-6 w-full accent-[color:var(--mint-ink)]"
          style={{ background: "transparent" }}
        />
        <div className="-mt-1 flex justify-between text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          <span>{mmss(position)}</span>
          <span>{duration > 0 ? mmss(duration) : preparing ? "preparing…" : "—"}</span>
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
            disabled={preparing && duration <= 0}
            className="btn btn--primary min-w-0 flex-1"
            aria-label={playing ? "Pause" : "Play"}
          >
            {preparing && duration <= 0 ? "Preparing…" : playing ? "Pause" : "Play"}
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

      {/* The depth toggle. Two taps from anywhere, never hidden. */}
      <div
        role="group"
        aria-label="How much detail"
        className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[color:var(--canvas)] p-1"
      >
        {(["short", "full"] as Depth[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={depth === d}
            onClick={() => onDepth(d)}
            className={[
              "min-h-[44px] rounded-[3px] font-[family-name:var(--font-display)] font-medium transition-colors",
              depth === d
                ? "bg-[color:var(--ink)] text-[color:var(--on-dark)]"
                : "text-[color:var(--ink-soft)]",
            ].join(" ")}
          >
            {d === "short" ? "Short · 40 sec" : "Full · 3 min"}
          </button>
        ))}
      </div>

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
