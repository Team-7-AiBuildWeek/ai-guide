"use client";

/**
 * One sheet, three heights, dragged between them.
 *
 * Deliberately a single component with a `height` state rather than components
 * that swap: the whole point is that the collapsed row grows into the full
 * screen, and a swap makes that impossible to animate.
 *
 * On the physics, which took a second attempt:
 *
 *  - The grab area is the whole bar, not the 4px line in it. A handle you have
 *    to hit is a handle that "sometimes does not work".
 *  - Letting go throws the sheet. A slow drag lands at the nearest height, a
 *    flick moves one height in the direction it was thrown, however far it
 *    actually travelled.
 *  - The snap is animated to a measured pixel height. Animating to `auto` —
 *    which is what the collapsed row is — does nothing at all, so the sheet
 *    used to jump the last part of the way.
 *  - The pointer is captured only once the finger has actually moved, so a tap
 *    on a button inside the draggable area is still a tap on that button.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SheetHeight = "collapsed" | "half" | "full";

/** In order, so a flick can step from one to the next. */
const ORDER: SheetHeight[] = ["collapsed", "half", "full"];

/** Where the sheet settles, as a share of the viewport. */
const SHARE: Record<SheetHeight, number> = { collapsed: 0.18, half: 0.55, full: 1 };

/** Below this, the finger has not moved and this is a tap. */
const SLOP_PX = 6;

/** Pixels per millisecond past which a drag counts as thrown, not placed. */
const FLICK_VELOCITY = 0.35;

/** Matches the CSS below, after which the inline height is handed back. */
const SETTLE_MS = 420;

/** Beyond this much of the screen, the sheet shows its full contents. */
const EXPANDED_SHARE = 0.35;

type Drag = {
  startY: number;
  startPx: number;
  lastY: number;
  lastT: number;
  /** Pixels per ms; positive is upward. */
  velocity: number;
  moved: boolean;
  captured: boolean;
  viewport: number;
};

export default function BottomSheet({
  height,
  onHeightChange,
  onCollapse,
  title,
  children,
  collapsedContent,
}: {
  height: SheetHeight;
  /** Where a drag left it. Omit to keep the sheet fixed to `height`. */
  onHeightChange?: (h: SheetHeight) => void;
  /** Omit to hide the back chevron — some steps must not be dismissable. */
  onCollapse?: () => void;
  title?: string;
  children: React.ReactNode;
  /** The single row shown when collapsed. */
  collapsedContent?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const settle = useRef<number | null>(null);
  /**
   * The collapsed row is as tall as whatever is in it, and that height is only
   * knowable while it is on screen. Remembered so the sheet can be animated
   * back down to it rather than dropped.
   */
  const collapsedPx = useRef(0);

  /** Inline height, while dragging and while settling afterwards. */
  const [px, setPx] = useState<number | null>(null);
  /** True only while a finger is down: the transition must be off then. */
  const [live, setLive] = useState(false);
  /**
   * Whether the sheet is currently big enough to show its full contents. State
   * rather than a sum done at render time, because the only honest input is the
   * live drag, and reading that during render is reading a ref during render.
   */
  const [bigEnough, setBigEnough] = useState(false);

  const open = height !== "collapsed";
  /**
   * A sheet is only draggable where there is somewhere to drag it to. Without
   * this the landing screen — whose whole content is the collapsed row — could
   * be pulled up into an empty panel.
   */
  const draggable = !!onHeightChange;

  useEffect(() => {
    if (height === "collapsed" && !live && sheetRef.current) {
      collapsedPx.current = sheetRef.current.getBoundingClientRect().height;
    }
  });

  useEffect(() => () => window.clearTimeout(settle.current ?? undefined), []);

  // Expanding scrolls a half-read sheet back to the top.
  useEffect(() => {
    if (height === "full") panelRef.current?.scrollTo({ top: 0 });
  }, [height]);

  // Escape collapses, matching the chevron.
  useEffect(() => {
    if (!open || !onCollapse) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCollapse();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCollapse]);

  const detentPx = useCallback((h: SheetHeight, viewport: number) => {
    if (h === "collapsed") return collapsedPx.current || viewport * SHARE.collapsed;
    return viewport * SHARE[h];
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!sheetRef.current || e.button !== 0) return;
      window.clearTimeout(settle.current ?? undefined);
      const startPx = sheetRef.current.getBoundingClientRect().height;
      drag.current = {
        startY: e.clientY,
        startPx,
        lastY: e.clientY,
        lastT: e.timeStamp,
        velocity: 0,
        moved: false,
        captured: false,
        viewport: window.innerHeight,
      };
      setLive(true);
      setPx(startPx);
      // Whatever it is showing now is right until the drag says otherwise.
      setBigEnough(open);
    },
    [open],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;

    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;

    if (!d.moved && Math.abs(e.clientY - d.startY) > SLOP_PX) {
      d.moved = true;
      // Claimed only now: before this it might have been a tap on a control
      // sitting inside the draggable area, and capturing would swallow it.
      if (!d.captured) {
        e.currentTarget.setPointerCapture(e.pointerId);
        d.captured = true;
      }
    }
    if (!d.moved) return;

    const raised = Math.max(72, Math.min(d.viewport, d.startPx + (d.startY - e.clientY)));
    setPx(raised);
    setBigEnough(raised > d.viewport * EXPANDED_SHARE);
  }, []);

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      setLive(false);
      if (d.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      // A tap, and only on the bar itself — a tap on a button inside the
      // collapsed row belongs to that button.
      if (!d.moved) {
        setPx(null);
        const onBar = (e.target as HTMLElement | null)?.closest("[data-sheet-bar]");
        if (!onBar) return;
        if (height === "collapsed") onHeightChange?.("half");
        else onCollapse?.();
        return;
      }

      const landedAt = d.startPx + (d.startY - d.lastY);
      const nearest = ORDER.reduce((best, h) =>
        Math.abs(detentPx(h, d.viewport) - landedAt) <
        Math.abs(detentPx(best, d.viewport) - landedAt)
          ? h
          : best,
      );

      // Thrown rather than placed: go one step the way it was thrown, from
      // wherever it was let go. This is what makes a short flick down close a
      // full sheet instead of leaving it hanging at half.
      let target = nearest;
      if (Math.abs(d.velocity) > FLICK_VELOCITY) {
        const from = ORDER.indexOf(nearest);
        target = ORDER[Math.max(0, Math.min(ORDER.length - 1, from + (d.velocity > 0 ? 1 : -1)))];
      }

      // Animated to a real number, then handed back to the class once it has
      // arrived. Going straight to `auto` would not animate at all.
      setPx(detentPx(target, d.viewport));
      settle.current = window.setTimeout(() => setPx(null), SETTLE_MS);
      if (target !== height) onHeightChange?.(target);
    },
    [detentPx, height, onCollapse, onHeightChange],
  );

  /**
   * The whole bar drags, not the line drawn on it. `touch-none` is what stops
   * the browser claiming the gesture as a page scroll and leaving the sheet
   * with three events and then silence.
   */
  const dragProps = draggable
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: finish,
        onPointerCancel: finish,
      }
    : {};
  /** `touch-none` is what stops the browser claiming the gesture as a page
   *  scroll and leaving the sheet with three events and then silence. */
  const dragClass = draggable ? "touch-none" : "";

  const bar = (
    <div
      data-sheet-bar
      role={draggable ? "separator" : undefined}
      aria-orientation={draggable ? "horizontal" : undefined}
      aria-label={draggable ? "Drag to resize" : undefined}
      className={`relative flex justify-center py-3 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div aria-hidden="true" className="h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
      {/* Untitled sheets — the walk — get their way out here rather than as a
          row of its own: a full-size back button on a line with nothing else
          on it spends a fifth of a half-height sheet saying "back". */}
      {onCollapse && !title ? (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Close"
          className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[color:var(--ink-mute)]"
        >
          ▾
        </button>
      ) : null}
    </div>
  );

  // Mid-drag the sheet shows whichever contents suit the size it is at, so
  // opening it is one continuous movement rather than a swap at the end.
  const expanded = px !== null ? bigEnough : open;

  return (
    <section
      ref={sheetRef}
      aria-label={title ?? "Tour options"}
      style={px !== null ? { height: `${px}px` } : undefined}
      className={[
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg",
        "rounded-t-[var(--radius-panel)] border border-b-0 border-[color:var(--line)]",
        "bg-[color:var(--surface)] shadow-[var(--shadow-lift)]",
        // A spring, not a linear slide — it should feel like it was thrown up.
        // Never while a finger is down: an animated height fights the drag and
        // the sheet lags behind the thumb.
        live ? "" : "transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]",
        px === null && height === "full" ? "h-[100dvh]" : "",
        px === null && height === "half" ? "h-[55dvh]" : "",
        px === null && height === "collapsed" ? "h-auto" : "",
        height === "full" && px === null ? "rounded-t-none" : "",
      ].join(" ")}
    >
      {expanded ? (
        <div className="flex h-full flex-col">
          <header
            {...dragProps}
            className={[
              dragClass,
              "flex shrink-0 flex-col border-b border-[color:var(--line)]",
              height === "full" ? "pt-[env(safe-area-inset-top)]" : "",
            ].join(" ")}
          >
            {bar}
            {title ? (
              <div className="flex items-center gap-3 px-4 pb-3">
                {onCollapse ? (
                  <button
                    type="button"
                    onClick={onCollapse}
                    className="btn btn--quiet shrink-0 px-4"
                    aria-label="Back"
                  >
                    ←
                  </button>
                ) : null}
                <h2 className="text-[length:var(--text-h3)]">{title}</h2>
              </div>
            ) : null}
          </header>
          <div
            ref={panelRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {children}
          </div>
        </div>
      ) : (
        // The whole collapsed row drags, buttons and all — the capture-after-
        // movement rule above is what keeps their taps working.
        <div {...dragProps} className={`${dragClass} pb-[max(1rem,env(safe-area-inset-bottom))]`}>
          {bar}
          <div className="px-4">{collapsedContent}</div>
        </div>
      )}
    </section>
  );
}
