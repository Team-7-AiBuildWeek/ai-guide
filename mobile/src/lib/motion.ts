/**
 * Motion shared by the app's animations — the website's timings, from
 * Transitions.dev ("Tabs sliding", "Panel reveal"), so both move the same.
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

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

/** The light tick of a choice being made — iOS's own selection haptic. */
export function tick() {
  void Haptics.selectionAsync().catch(() => {});
}

/**
 * A scale that pops once each time `on` turns true: the website's chip-pop,
 * so picking something looks picked. Starts at rest, so nothing pops on mount.
 */
export function usePop(on: boolean): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 120, easing: EASE, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start();
    }
    was.current = on;
  }, [on, scale]);
  return scale;
}
