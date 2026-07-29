"use client";

/**
 * The retracted player.
 *
 * The tour screen is a map, and a sheet holding a scrubber, skip buttons, a
 * depth toggle and a voice switch covers most of it. Retracted, the sheet
 * keeps only what a walker needs mid-street: whether it is playing, where they
 * are, and a way to ask. Everything else is one tap away.
 */

function mmss(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function MiniPlayer({
  stopName,
  index,
  total,
  playing,
  preparing,
  position,
  duration,
  onToggle,
  onExpand,
  onAsk,
}: {
  stopName: string;
  index: number;
  total: number;
  playing: boolean;
  preparing: boolean;
  position: number;
  duration: number;
  onToggle: () => void;
  onExpand: () => void;
  onAsk: () => void;
}) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={preparing && duration <= 0}
        aria-label={playing ? "Pause" : "Play"}
        className="btn btn--primary btn--icon shrink-0"
      >
        {preparing && duration <= 0 ? (
          <span className="text-[length:var(--text-caption)]">…</span>
        ) : playing ? (
          // Two bars.
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
            <rect x="6" y="4" width="4.5" height="16" rx="1.2" />
            <rect x="13.5" y="4" width="4.5" height="16" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
            <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.2-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2z" />
          </svg>
        )}
      </button>

      {/* The whole middle is the expand target — a bigger hit area than a
          chevron, and the obvious thing to press to see more. */}
      <button
        type="button"
        onClick={onExpand}
        className="min-w-0 flex-1 text-left"
        aria-label={`${stopName}, stop ${index + 1} of ${total}. Open the player.`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
            {stopName}
          </span>
          <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
            {duration > 0 ? `${mmss(position)} / ${mmss(duration)}` : `${index + 1}/${total}`}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[color:var(--mint-ink)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      <button
        type="button"
        onClick={onAsk}
        aria-label="Ask anything"
        className="btn btn--quiet btn--icon shrink-0"
      >
        {/* Speech bubble. */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
          <path
            d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.3 9.3 0 0 1-2.8-.4L4 21l1.5-4.2A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
