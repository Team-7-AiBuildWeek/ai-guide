/**
 * Two small hand-offs between the tabs.
 *
 *  - Whether the tab bar shows: Explore hides it while a tour is being built
 *    or walked, the way the website does, so the map has the whole screen.
 *  - "Carry on walking" pressed on the Tours tab, for Explore to pick up.
 */

import { useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();

export function setTabBarHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((l) => l());
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden,
  );
}

let resume = false;

export function requestResume() {
  resume = true;
}

export function takeResume(): boolean {
  const asked = resume;
  resume = false;
  return asked;
}
