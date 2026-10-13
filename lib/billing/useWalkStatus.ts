"use client";

/**
 * What this person can build next, from /api/billing/status, for gating
 * "Build my tour" before the wait instead of after it, and for the "Your walks"
 * card on the Account tab. `enabled: false` means the paywall does not apply
 * (switched off, or shadow mode): nothing about plans is shown and every build
 * goes ahead.
 *
 * The last answer is remembered on this device and shown straight away, so the
 * card is there the moment the Account tab opens instead of popping in a second
 * later when the server answers. The fresh answer replaces it as soon as it
 * arrives. A remembered answer can be out of date (walks bought on the phone a
 * minute ago), so `fresh` says which one this is: display may use either, the
 * gate in front of a build only trusts a fresh one — and the server enforces
 * regardless.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PaywallReason } from "./store";

export type ClientWalkStatus = {
  enabled: boolean;
  signedIn: boolean;
  canWalk: boolean;
  reason?: PaywallReason | null;
  freeWalkLeft?: boolean;
  credits?: number;
  bonusCredits?: number;
  pass?: { kind: string; until: string; usedToday: number; perDay: number } | null;
  annual?: { status: string; until: string; cancelling: boolean; usedThisMonth: number; perMonth: number } | null;
};

export type WalkStatusState = {
  status: ClientWalkStatus;
  /** Nothing known yet: no remembered answer and the server has not replied. */
  loading: boolean;
  /** This answer came from the server during this visit (not from memory). */
  fresh: boolean;
};

const UNKNOWN: ClientWalkStatus = { enabled: false, signedIn: false, canWalk: true };
const KEY = "wd:walk-status";
const SERVER: WalkStatusState = { status: UNKNOWN, loading: true, fresh: false };

// One store for the whole page, shared by every component that asks.
let state: WalkStatusState | null = null;
const listeners = new Set<() => void>();

function initial(): WalkStatusState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { status: JSON.parse(raw) as ClientWalkStatus, loading: false, fresh: false };
  } catch {
    /* private mode, or a broken entry: start from nothing */
  }
  return SERVER;
}

function snapshot(): WalkStatusState {
  state ??= initial();
  return state;
}

function set(next: WalkStatusState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let inflight: Promise<ClientWalkStatus> | null = null;

export async function fetchWalkStatus(): Promise<ClientWalkStatus> {
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) return snapshot().status;
      const status = (await res.json()) as ClientWalkStatus;
      try {
        localStorage.setItem(KEY, JSON.stringify(status));
      } catch {
        /* private mode: just not remembered */
      }
      set({ status, loading: false, fresh: true });
      return status;
    } catch {
      return snapshot().status; // offline: the build itself enforces
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useWalkStatus(): WalkStatusState & { refresh: () => Promise<ClientWalkStatus> } {
  const current = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  // Ask the server whenever a screen that shows this opens, whatever is
  // remembered; asks already on their way are shared, not repeated.
  useEffect(() => {
    void fetchWalkStatus();
  }, []);
  const refresh = useCallback(() => fetchWalkStatus(), []);
  return { ...current, refresh };
}
