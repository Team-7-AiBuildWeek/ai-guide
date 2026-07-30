"use client";

/**
 * One sheet, three heights, dragged between them.
 *
 * Deliberately a single component with a `height` state rather than components
 * that swap: the whole point is that the collapsed row grows into the full
 * screen, and a swap makes that impossible to animate.
 *
 * On the physics, which took three goes:
 *
 *  - The height is written straight to the DOM while a finger is down. Putting
 *    it in React state re-rendered the sheet and everything in it — player,
 *    transcript, every stop — on every touchmove, which on a phone is sixty
 *    renders a second and reads as the sheet lagging behind the thumb. React
 *    hears about the drag once, when it ends.
 *  - The content drags the sheet too, not just the bar. Anywhere in a phone
 *    sheet is a handle when the content is already scrolled to the top, and
 *    "swipe down on the panel" is the gesture people arrive with. Below the
 *    top the same swipe scrolls, which is why this is a non-passive touch
 *    listener rather than a pointer handler: it has to decide, per move,
 *    whether the browser or the sheet gets the gesture.
 *  - Letting go throws it. A slow drag lands at the nearest height, a flick
 *    moves one height in the direction it was thrown, however far it travelled.
 *  - Past full it resists rather than stopping dead, so pulling too far feels
 *    like a limit instead of a bug.
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

/** Matches the CSS transition, after which the inline height is handed back. */
const SETTLE_MS = 420;

/** How much of a pull past the top actually moves it. */
const OVERSHOOT = 0.2;

type Drag = {
  startY: number;
  startPx: number;
  lastY: number;
  lastT: number;
  /** Pixels per ms; positive is upward. */
  velocity: number;
  moved: boolean;
  viewport: number;
  /** Set when the gesture began in the scrolling content rather than the bar. */
  fromContent: boolean;
};

export default function BottomSheet({
  height,
  onHeightChange,
  onCollapse,
  title,
  children,
  footer,
  collapsedContent,
}: {
  height: SheetHeight;
  /** Where a drag left it. Omit to keep the sheet fixed to `height`. */
  onHeightChange?: (h: SheetHeight) => void;
  /** Omit to hide the back chevron — some steps must not be dismissable. */
  onCollapse?: () => void;
  title?: string;
  children: React.ReactNode;
  /**
   * Buttons pinned below the scrolling content.
   *
   * A real element under the scroll box rather than a `sticky` one inside it.
   * Sticky positions against the scroll container's content box, so the
   * container's own bottom padding stays *below* the pinned row — a band the
   * content scrolls through and is visible in. The sheet supplies the rule,
   * the background and the home-indicator inset; the step supplies the
   * buttons.
   */
  footer?: React.ReactNode;
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

  /**
   * What the sheet was showing when the drag began, held for the whole
   * gesture — and the only thing a drag tells React until it ends.
   *
   * Swapping contents mid-drag looks better and breaks the drag: the element
   * the gesture is attached to is inside the branch being swapped, so crossing
   * the threshold unmounts it, no touchend or pointerup ever arrives, and the
   * sheet is left frozen at whatever height the finger last set. Null means no
   * gesture is in progress.
   */
  const [frozen, setFrozen] = useState<boolean | null>(null);

  const open = height !== "collapsed";
  /**
   * A sheet is only draggable where there is somewhere to drag it to. Without
   * this the landing screen — whose whole content is the collapsed row — could
   * be pulled up into an empty panel.
   */
  const draggable = !!onHeightChange;
  const expanded = frozen ?? open;

  useEffect(() => {
    if (height === "collapsed" && !drag.current && sheetRef.current) {
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

  // ------------------------------------------------------------- the gesture

  const begin = useCallback((clientY: number, fromContent: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    window.clearTimeout(settle.current ?? undefined);
    drag.current = {
      startY: clientY,
      startPx: el.getBoundingClientRect().height,
      lastY: clientY,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
      viewport: window.innerHeight,
      fromContent,
    };
    // The transition is what makes a release spring; during the drag it is
    // what makes the sheet lag behind the thumb.
    el.style.transition = "none";
    setFrozen(height !== "collapsed");
  }, [height]);

  const move = useCallback((clientY: number) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;

    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.velocity = (d.lastY - clientY) / dt;
    d.lastY = clientY;
    d.lastT = now;
    if (!d.moved && Math.abs(clientY - d.startY) > SLOP_PX) d.moved = true;
    if (!d.moved) return;

    const wanted = d.startPx + (d.startY - clientY);
    // Past the top it gives, rather than stopping dead against nothing.
    const raised =
      wanted > d.viewport
        ? d.viewport + (wanted - d.viewport) * OVERSHOOT
        : Math.max(72, wanted);

    // Straight to the DOM. This is the whole reason the drag is smooth.
    el.style.height = `${raised}px`;
  }, []);

  const end = useCallback(() => {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    setFrozen(null);
    if (!d || !el) return;

    el.style.transition = "";
    if (!d.moved) {
      el.style.height = "";
      return;
    }

    const landedAt = el.getBoundingClientRect().height;
    const nearest = ORDER.reduce((best, h) =>
      Math.abs(detentPx(h, d.viewport) - landedAt) <
      Math.abs(detentPx(best, d.viewport) - landedAt)
        ? h
        : best,
    );

    // Thrown rather than placed: one step the way it was thrown, from wherever
    // it was let go. This is what makes a short flick down close a full sheet
    // instead of leaving it hanging at half.
    let target = nearest;
    if (Math.abs(d.velocity) > FLICK_VELOCITY) {
      const from = ORDER.indexOf(nearest);
      target = ORDER[Math.max(0, Math.min(ORDER.length - 1, from + (d.velocity > 0 ? 1 : -1)))];
    }

    // Animated to a real number, then handed back to the class once it has
    // arrived — going straight to `auto` would not animate at all.
    el.style.height = `${detentPx(target, d.viewport)}px`;
    settle.current = window.setTimeout(() => {
      if (sheetRef.current) sheetRef.current.style.height = "";
    }, SETTLE_MS);
    if (target !== height) onHeightChange?.(target);
  }, [detentPx, height, onHeightChange]);

  /**
   * Dragging from inside the scrolling content.
   *
   * Which of the two the gesture belongs to depends on where the sheet already
   * is, and this is the rule every phone sheet uses:
   *
   *  - Pulling UP moves the sheet until it has nowhere left to go. Only at full
   *    height does an upward swipe scroll what is inside. Without this, a sheet
   *    at half looked stuck: the content took the gesture, scrolled nothing
   *    because there was nothing above it, and the only way up was to find the
   *    bar at the top.
   *  - Pulling DOWN scrolls back through the content first, and moves the sheet
   *    only once the content is already at its top.
   *
   * Non-passive, because that decision has to cancel the browser's default
   * halfway through a gesture it has already started handling.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !draggable) return;

    let candidate: { y: number; taken: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      candidate = { y: e.touches[0].clientY, taken: false };
    };

    const onMove = (e: TouchEvent) => {
      if (!candidate || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;

      if (!candidate.taken) {
        const travelled = y - candidate.y;
        if (Math.abs(travelled) <= SLOP_PX) return;
        const mine =
          travelled < 0
            ? height !== "full" // up: grow, until there is nothing left to grow into
            : panel.scrollTop <= 0; // down: only once the content is back at its top
        if (!mine) return;
        candidate.taken = true;
        begin(candidate.y, true);
      }
      e.preventDefault();
      move(y);
    };

    const onEnd = () => {
      if (candidate?.taken) end();
      candidate = null;
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
    // `height` is in here because the rule above reads it: the listeners have
    // to be rebound when the sheet changes detent, or an upward swipe at full
    // would still be treated as one at half.
  }, [draggable, begin, move, end, expanded, height]);


  // The bar and the collapsed row: pointer events, because there is nothing to
  // share the gesture with there.
  const barHandlers = draggable
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          begin(e.clientY, false);
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (!drag.current || drag.current.fromContent) return;
          // Claimed only once the finger has moved, so a tap on a button
          // inside the collapsed row is still that button's tap.
          if (drag.current.moved && e.currentTarget.hasPointerCapture?.(e.pointerId) === false) {
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          move(e.clientY);
        },
        onPointerUp: (e: React.PointerEvent) => {
          const wasTap = drag.current && !drag.current.moved;
          const target = e.target as HTMLElement | null;
          end();
          if (!wasTap) return;
          // A tap on the bar itself is the shortcut; a tap on a control in the
          // collapsed row belongs to that control.
          if (!target?.closest("[data-sheet-bar]")) return;
          if (height === "collapsed") onHeightChange?.("half");
          else onCollapse?.();
        },
        onPointerCancel: () => end(),
      }
    : {};
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

  return (
    <section
      ref={sheetRef}
      aria-label={title ?? "Tour options"}
      className={[
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg",
        "rounded-t-[var(--radius-panel)] border border-b-0 border-[color:var(--line)]",
        "bg-[color:var(--surface)] shadow-[var(--shadow-lift)]",
        // A spring, not a linear slide — it should feel like it was thrown up.
        "transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]",
        height === "full" ? "h-[100dvh] rounded-t-none" : "",
        height === "half" ? "h-[55dvh]" : "",
        height === "collapsed" ? "h-auto" : "",
      ].join(" ")}
    >
      {expanded ? (
        <div className="flex h-full flex-col">
          <header
            {...barHandlers}
            className={[
              dragClass,
              "flex shrink-0 flex-col border-b border-[color:var(--line)]",
              // A notch where there is one, and a little air where there is not.
              height === "full" ? "pt-[max(0.25rem,env(safe-area-inset-top))]" : "",
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
            // The top pad is bigger than the bottom on purpose: it is the one
            // that has a hard divider above it, and 16px under a line reads as
            // nothing at all.
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-6"
          >
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-[color:var(--line)] bg-[color:var(--surface)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      ) : (
        // The whole collapsed row drags, buttons and all — the capture-after-
        // movement rule above is what keeps their taps working.
        <div {...barHandlers} className={`${dragClass} pb-[max(1rem,env(safe-area-inset-bottom))]`}>
          {bar}
          {/* The bar is a grab area, not a margin. Without this the first line
              of the row sits directly under it and the sheet reads as clipped. */}
          <div className="px-4 pt-1">{collapsedContent}</div>
        </div>
      )}
    </section>
  );
}
