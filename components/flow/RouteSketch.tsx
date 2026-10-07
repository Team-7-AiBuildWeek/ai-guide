"use client";

/**
 * The walk, drawn before it exists: a loop with a dot for every stop.
 *
 * The estimate as a picture — Komoot's route preview, for a route nobody has
 * planned yet. More time adds dots; a faster pace widens the loop, because the
 * same stops are further apart. Dots that stay slide to their new places,
 * new ones pop in, so changing a setting visibly changes the walk.
 *
 * Not a map and not a promise about the shape: a sketch, and drawn like one.
 */

import { useT } from "@/lib/i18n/ui";
import type { Draft } from "@/lib/tour/flow";
import { tourShape } from "@/lib/tour/shape";

const W = 168;
const H = 112;

/** A hand-drawn-looking closed loop: an ellipse with a little wobble. */
function loopPoint(theta: number, scale: number) {
  const wobble = 1 + 0.1 * Math.sin(3 * theta + 0.6) + 0.05 * Math.cos(5 * theta);
  return {
    x: W / 2 + Math.cos(theta) * 70 * scale * wobble,
    y: H / 2 + Math.sin(theta) * 42 * scale * wobble,
  };
}

const LOOP_PATH = (() => {
  const pts = Array.from({ length: 96 }, (_, i) => loopPoint((i / 96) * Math.PI * 2 - Math.PI / 2, 1));
  return `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`;
})();

/** How wide the loop is drawn: more kilometres, a bigger loop, within reason. */
export function loopScale(km: number) {
  return Math.min(1, 0.55 + km / 10);
}

export default function RouteSketch({ draft }: { draft: Draft }) {
  const t = useT();
  const { stops, km } = tourShape(draft);
  const scale = loopScale(km);

  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-card)] bg-[color:var(--mint-wash)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-display)] text-[40px] font-semibold leading-none tabular-nums text-[color:var(--ink)]">
          <Roll value={stops} />
        </p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-body)] font-medium text-[color:var(--ink)]">
          {t("sketch.stops")}
        </p>
        <p className="mt-0.5 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
          ≈ <Roll value={km} /> km · {t(`durationShort.${draft.durationMinutes}`)}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="shrink-0 overflow-visible">
        <g
          className="sketch-loop"
          style={{ transform: `scale(${scale})`, transformOrigin: `${W / 2}px ${H / 2}px` }}
        >
          <path
            d={LOOP_PATH}
            fill="none"
            stroke="var(--mint-ink)"
            strokeWidth={2 / scale}
            strokeDasharray={`${5 / scale} ${5 / scale}`}
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
        {Array.from({ length: stops }, (_, i) => {
          const p = loopPoint((i / stops) * Math.PI * 2 - Math.PI / 2, scale);
          const start = i === 0;
          return (
            <g key={i} className="sketch-dot" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
              <circle
                className="sketch-dot__in"
                r={start ? 7 : stops > 12 ? 4 : 5}
                fill={start ? "var(--ink)" : "var(--mint)"}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * A number that rolls when it changes: the new value slides up into place.
 * Keyed on the value, so every change is a fresh element running the
 * animation once — nothing to reset.
 */
export function Roll({ value }: { value: number | string }) {
  return (
    <span key={String(value)} className="roll-in inline-block">
      {value}
    </span>
  );
}
