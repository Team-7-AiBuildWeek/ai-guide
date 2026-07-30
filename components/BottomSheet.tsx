"use client";

/**
 * One sheet, three heights, draggable between them.
 *
 * Deliberately a single component with a `height` state rather than components
 * that swap: the whole point is that the collapsed row grows into the full
 * screen, and a swap makes that impossible to animate.
 *
 * The handle is a real handle. It used to be a decorative bar that said "this
 * thing moves" while the only way to move it was a button somewhere else —
 * which is worse than no affordance at all, because it invites the gesture and
 * then ignores it. Dragging now sets the height directly and lets go into the
 * nearest of the three.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SheetHeight = "collapsed" | "half" | "full";

/** Where the sheet settles, as a share of the viewport. Collapsed is measured
 *  from its own content, since it is one row of whatever is in it. */
const DETENT: Record<Exclude<SheetHeight, "collapsed">, number> = {
  half: 0.55,
  full: 1,
};

/** Below this, a drag was a tap on the handle and should change nothing. */
const DRAG_SLOP_PX = 6;

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
  /** Pixels, while a finger is on the handle. Null the rest of the time. */
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  const open = height !== "collapsed";

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

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!sheetRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
      moved: false,
    };
    setDragHeight(sheetRef.current.getBoundingClientRect().height);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = d.startY - e.clientY; // up is bigger
    if (Math.abs(delta) > DRAG_SLOP_PX) d.moved = true;
    // A sheet taller than the screen is a scroll bug waiting to happen, and one
    // shorter than the handle cannot be grabbed again.
    const max = window.innerHeight;
    setDragHeight(Math.max(72, Math.min(max, d.startHeight + delta)));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      const landedAt = dragHeight;
      setDragHeight(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!d || landedAt === null) return;

      // A tap, not a drag: treat it as the chevron so the handle is never dead.
      if (!d.moved) {
        if (height === "collapsed") onHeightChange?.("half");
        else onCollapse?.();
        return;
      }

      // Nearest detent by distance, with the collapsed row measured rather than
      // guessed — it is as tall as whatever is in it.
      const vh = window.innerHeight;
      const collapsedPx = Math.min(d.startHeight, vh * 0.3);
      const candidates: [SheetHeight, number][] = [
        ["collapsed", height === "collapsed" ? collapsedPx : vh * 0.18],
        ["half", vh * DETENT.half],
        ["full", vh * DETENT.full],
      ];
      const nearest = candidates.reduce((best, c) =>
        Math.abs(c[1] - landedAt) < Math.abs(best[1] - landedAt) ? c : best,
      );
      if (nearest[0] !== height) onHeightChange?.(nearest[0]);
    },
    [dragHeight, height, onCollapse, onHeightChange],
  );

  const dragging = dragHeight !== null;
  const style = dragging
    ? { height: `${dragHeight}px` }
    : height === "half"
      ? { height: `${DETENT.half * 100}dvh` }
      : undefined;

  const handle = (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // touch-none: without it the browser claims the gesture as a page scroll
      // and the sheet receives three events and then silence.
      className="flex touch-none cursor-grab justify-center py-3 active:cursor-grabbing"
    >
      <div aria-hidden="true" className="h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
    </div>
  );

  return (
    <section
      ref={sheetRef}
      aria-label={title ?? "Tour options"}
      style={style}
      className={[
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg",
        "rounded-t-[var(--radius-panel)] border border-b-0 border-[color:var(--line)]",
        "bg-[color:var(--surface)] shadow-[var(--shadow-lift)]",
        // A spring, not a linear slide — it should feel like it was thrown up.
        // Never while a finger is on it: an animated height fights the drag and
        // the sheet lags behind the thumb.
        dragging
          ? ""
          : "transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]",
        height === "full" && !dragging ? "h-[100dvh] rounded-t-none" : "",
        height === "collapsed" && !dragging ? "h-auto" : "",
      ].join(" ")}
    >
      {open || dragging ? (
        <div className="flex h-full flex-col">
          <header
            className={[
              "flex shrink-0 flex-col border-b border-[color:var(--line)]",
              // Only at full height does the sheet reach the notch.
              height === "full" ? "pt-[env(safe-area-inset-top)]" : "",
            ].join(" ")}
          >
            {handle}
            {onCollapse || title ? (
              <div className="flex items-center gap-3 px-5 pb-4">
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
                {title ? <h2 className="text-[length:var(--text-h3)]">{title}</h2> : null}
              </div>
            ) : null}
          </header>
          <div
            ref={panelRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          {handle}
          <div className="px-5">{collapsedContent}</div>
        </div>
      )}
    </section>
  );
}
