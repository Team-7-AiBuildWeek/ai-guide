/**
 * Whether the signed-in account is a developer — asked of the server once per
 * launch, and again after signing in or out. False until it answers, and for
 * everyone who is not, so the developer tools never show for anyone else.
 */

import { useSyncExternalStore } from "react";
import { developerStatus } from "./accounts";

/** `tts` is the server's TTS_PROVIDER, for pricing the voice. */
type State = { developer: boolean; info: Record<string, string> | null; tts: string | null };

const NOBODY: State = { developer: false, info: null, tts: null };
let state: State = NOBODY;
let asked = false;
const listeners = new Set<() => void>();

function ask() {
  if (asked) return;
  asked = true;
  void developerStatus().then((next) => {
    if (!next.developer) return;
    state = next;
    listeners.forEach((l) => l());
  });
}

/** Asks again — after signing in or out. */
export function recheckDeveloper() {
  asked = false;
  state = NOBODY;
  listeners.forEach((l) => l());
  ask();
}

export function useDeveloper(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      ask();
      return () => listeners.delete(l);
    },
    () => state,
    () => NOBODY,
  );
}
