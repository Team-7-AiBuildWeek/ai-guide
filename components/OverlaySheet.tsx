"use client";

/**
 * A sheet over the current page — the welcome screen's sign-in sheet, wherever
 * else one is needed: the map's look (rounded top, hairline, grabber) and the
 * panel reveal (see .t-panel-slide). Always mounted, so it animates closed as
 * well as open; tapping the dimmed page behind it closes it.
 */

import type { ReactNode } from "react";

export default function OverlaySheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <div aria-hidden="true" data-open={open} className="t-backdrop fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div
        className="welcome-sheet welcome-sheet--shown t-panel-slide z-50"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--line-strong)]" />
        {children}
      </div>
    </>
  );
}
