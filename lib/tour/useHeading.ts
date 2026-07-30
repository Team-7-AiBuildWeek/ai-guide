"use client";

/**
 * Which way the walker is facing.
 *
 * The GPS says where you are; it does not say which way you are pointed, and
 * without that a dot on a map is a puzzle — every street looks like a
 * candidate until you have walked ten metres down one of the wrong ones. This
 * is the cone every phone map draws, and it comes from the magnetometer rather
 * than from the fix.
 *
 * Two dialects of the same event, because the platforms never agreed:
 *  - Safari gives `webkitCompassHeading`, already degrees clockwise from true
 *    north, and demands permission be asked for from inside a tap.
 *  - Everyone else gives `alpha` on the `deviceorientationabsolute` event,
 *    counter-clockwise from north, so it has to be subtracted from 360.
 */

import { useEffect, useState } from "react";

type SafariOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionCapable = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

/**
 * Ask for the compass, from inside a user gesture.
 *
 * Only iOS has anything to ask, and it must be asked synchronously in a tap or
 * it is refused. Everywhere else this resolves true without doing anything.
 */
export async function requestHeadingPermission(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const cls = DeviceOrientationEvent as unknown as PermissionCapable;
  if (typeof cls.requestPermission !== "function") return true;
  try {
    return (await cls.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * Degrees clockwise from north, or null when the device will not say.
 *
 * Rounded, and only published when it has actually turned: a magnetometer
 * reports a jittering fraction of a degree many times a second, and every one
 * of those would be a React render and a repaint of the map.
 */
export function useHeading(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    let last: number | null = null;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const safari = (e as SafariOrientationEvent).webkitCompassHeading;
      const degrees =
        typeof safari === "number" ? safari : e.absolute && e.alpha !== null ? 360 - e.alpha : null;
      if (degrees === null || Number.isNaN(degrees)) return;

      const rounded = Math.round(((degrees % 360) + 360) % 360);
      // Shortest way round, so 359° to 1° counts as two degrees, not 358.
      const turned = last === null ? 999 : Math.abs(((rounded - last + 540) % 360) - 180);
      if (turned < 3) return;
      last = rounded;
      setHeading(rounded);
    };

    window.addEventListener("deviceorientationabsolute", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [active]);

  return heading;
}
