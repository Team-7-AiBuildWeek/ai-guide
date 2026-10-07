"use client";

/**
 * The turn card, top right, grown open into the walking directions — after
 * Transitions.dev's "Plus to menu morph".
 *
 * One dark-glass surface: closed it is the card (the arrow and the distance),
 * open it is the directions panel. Width, height and corner radius animate
 * from the card's corner, so the panel comes out of the thing you tapped
 * rather than up from the bottom of the screen; the card's contents fade and
 * slide out as the directions fade, scale and un-blur in.
 *
 * Both sizes are measured from what they hold, so the panel opens to exactly
 * its contents, whatever the directions say.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Size = { w: number; h: number };

function useSize(ref: React.RefObject<HTMLElement | null>, fallback: Size): Size {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  return size;
}

export default function DirectionsMorph({
  open,
  onToggle,
  trigger,
  triggerLabel,
  closedRadius = 22,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** What the closed card shows. */
  trigger: ReactNode;
  triggerLabel: string;
  /** The card's own corner radius: 22 for the turn card, half its height for a round button. */
  closedRadius?: number;
  /** The open panel. */
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closed = useSize(triggerRef, { w: 92, h: 92 });
  const opened = useSize(menuRef, { w: 320, h: 280 });

  const sizes = {
    "--morph-w-closed": `${closed.w}px`,
    "--morph-h-closed": `${closed.h}px`,
    "--morph-w-open": `${opened.w}px`,
    "--morph-h-open": `${opened.h}px`,
    "--morph-r-closed": `${closedRadius}px`,
  } as CSSProperties;

  return (
    // Holds the card's place in the bar; the surface grows out of its top-right corner.
    <div className="t-morph-anchor" style={{ width: closed.w, height: closed.h }}>
      <div className="t-morph panel-dark panel--glass" data-open={open} style={sizes}>
        <div className="t-morph-menu" aria-hidden={!open} inert={!open}>
          <div ref={menuRef} className="t-morph-menu-inner">
            {children}
          </div>
        </div>
        <button type="button" className="t-morph-plus" onClick={onToggle} aria-expanded={open} aria-label={triggerLabel}>
          <span ref={triggerRef} className="inline-flex">
            {trigger}
          </span>
        </button>
      </div>
    </div>
  );
}
