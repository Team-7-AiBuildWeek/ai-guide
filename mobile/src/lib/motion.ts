/**
 * Motion shared by the app's animations — the website's timings, from
 * Transitions.dev ("Tabs sliding", "Panel reveal"), so both move the same.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo, Easing } from "react-native";

/** The one ease both use: quick to start, long soft landing. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export const TAB_SLIDE_MS = 250;
export const PANEL_OPEN_MS = 400;
export const PANEL_CLOSE_MS = 350;

/** Whether the walker has asked their phone for less motion. */
export function useReduceMotion(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => sub.remove();
  }, []);
  return still;
}
