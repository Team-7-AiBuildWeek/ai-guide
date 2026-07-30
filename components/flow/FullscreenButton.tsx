"use client";

/**
 * Two ways to get the browser out of the way, and the app offers whichever one
 * the device actually has.
 *
 * Chrome, Edge and desktop Safari have the Fullscreen API, so a tap takes the
 * whole screen there and gives it back. iPhone Safari does not — Apple has
 * never shipped it on the phone — and the only route to a full screen is
 * adding the app to the home screen, which the manifest and the apple-web-app
 * meta already set up. So on an iPhone this is a sentence rather than a
 * button, because a button that cannot work is worse than an instruction.
 *
 * Once the app *is* installed, neither is worth screen space: the browser
 * chrome is already gone, and `display-mode: standalone` is how you know.
 */

import { useSyncExternalStore } from "react";

/**
 * All three facts belong to the browser, not to React, so they are read from
 * it rather than copied into state — which is also what stops an effect
 * writing state on mount for something that was knowable all along.
 */
const onFullscreenChange = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};

/** Capabilities do not change within a session; nothing to subscribe to. */
const never = () => () => {};

export default function FullscreenButton() {
  const isFull = useSyncExternalStore(
    onFullscreenChange,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const supported = useSyncExternalStore(
    never,
    () => document.fullscreenEnabled ?? false,
    () => false,
  );
  const installed = useSyncExternalStore(
    never,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS's own flag, which predates the media query and is still the only
      // one Safari sets for a home-screen app.
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    // On the server, assume there is nothing to offer: rendering a control
    // that then vanishes is worse than one that appears.
    () => true,
  );
  // Deliberately not `display-mode: fullscreen`, which also matches while the
  // Fullscreen API is active — testing it here hid the button the moment it
  // worked, leaving no way back out except the keyboard.

  if (installed) return null;

  if (!supported) {
    return (
      <p className="mt-3 text-center text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
        For the whole screen: Share → Add to Home Screen.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        // Refused when the gesture is not trusted, and on a page that is
        // already exiting. Either way there is nothing useful to say about it.
        if (isFull) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
      // Quieter than the two buttons above it: this is about the browser, not
      // about the walk, and a third full-width pill made all three look like
      // steps in the same decision.
      className="mt-3 min-h-[44px] w-full text-center font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-medium text-[color:var(--ink-mute)] underline underline-offset-4"
    >
      {isFull ? "Leave full screen" : "Full screen"}
    </button>
  );
}
