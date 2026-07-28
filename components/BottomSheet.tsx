"use client";

/**
 * One sheet, two heights.
 *
 * Deliberately a single component with a `height` state rather than two
 * components that swap: the whole point is that the collapsed row grows into
 * the full screen, and a swap makes that impossible to animate.
 */

import { useEffect, useRef } from "react";

export type SheetHeight = "collapsed" | "full";

export default function BottomSheet({
  height,
  onCollapse,
  title,
  children,
  collapsedContent,
}: {
  height: SheetHeight;
  /** Omit to hide the back chevron — some steps must not be dismissable. */
  onCollapse?: () => void;
  title?: string;
  children: React.ReactNode;
  /** The single row shown when collapsed. */
  collapsedContent?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const full = height === "full";

  // Expanding scrolls a half-read sheet back to the top.
  useEffect(() => {
    if (full) panelRef.current?.scrollTo({ top: 0 });
  }, [full]);

  // Escape collapses, matching the chevron.
  useEffect(() => {
    if (!full || !onCollapse) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCollapse();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, onCollapse]);

  return (
    <section
      aria-label={title ?? "Tour options"}
      className={[
        "pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg",
        "rounded-t-[var(--radius-panel)] border border-b-0 border-[color:var(--line)]",
        "bg-[color:var(--surface)] shadow-[var(--shadow-lift)]",
        // A spring, not a linear slide — it should feel like it was thrown up.
        "transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]",
        full ? "h-[100dvh] rounded-t-none" : "h-auto",
      ].join(" ")}
    >
      {full ? (
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--line)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
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
          </header>
          <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
            {children}
          </div>
        </div>
      ) : (
        <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Grab handle: the affordance that says this thing moves. */}
          <div
            aria-hidden="true"
            className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--line-strong)]"
          />
          {collapsedContent}
        </div>
      )}
    </section>
  );
}
