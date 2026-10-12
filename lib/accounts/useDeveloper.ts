"use client";

/**
 * Whether the signed-in account is a developer, asked of the server once per
 * page load (see lib/accounts/developer.ts). False until it answers, and for
 * everyone who is not — so the developer tools never flash up for anyone else.
 */

import { useSyncExternalStore } from "react";
import { accountsEnabled } from "./client";

export type DeveloperInfo = Record<string, string>;
type State = { developer: boolean; info: DeveloperInfo | null };

const NOBODY: State = { developer: false, info: null };
let state: State = NOBODY;
let asked = false;
const listeners = new Set<() => void>();

function ask() {
  if (asked || !accountsEnabled) return;
  asked = true;
  void fetch("/api/me/developer")
    .then((r) => (r.ok ? (r.json() as Promise<{ developer?: boolean; info?: DeveloperInfo }>) : null))
    .then((body) => {
      if (!body?.developer) return;
      state = { developer: true, info: body.info ?? null };
      listeners.forEach((l) => l());
    })
    .catch(() => {});
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
