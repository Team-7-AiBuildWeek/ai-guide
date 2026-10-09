"use client";

import { useEffect, useState } from "react";

/**
 * How much of the screen the on-screen keyboard is covering, in pixels.
 *
 * iPhone Safari lays the keyboard over the page rather than shrinking it, so
 * anything pinned to the bottom — a sheet with an email field in it — ends up
 * underneath. The visual viewport is what is left above the keyboard; lifting
 * the sheet by the difference keeps the field being typed in on screen.
 * Zero on desktops and whenever no keyboard is open.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}
