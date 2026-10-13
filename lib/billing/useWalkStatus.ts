"use client";

/**
 * What this person can build next, from /api/billing/status, for gating
 * "Build my tour" before the wait instead of after it. `enabled: false` means
 * the paywall does not apply (switched off, or shadow mode): nothing about
 * plans is shown and every build goes ahead.
 */

import { useCallback, useEffect, useState } from "react";
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

const UNKNOWN: ClientWalkStatus = { enabled: false, signedIn: false, canWalk: true };

export async function fetchWalkStatus(): Promise<ClientWalkStatus> {
  try {
    const res = await fetch("/api/billing/status", { cache: "no-store" });
    return res.ok ? ((await res.json()) as ClientWalkStatus) : UNKNOWN;
  } catch {
    return UNKNOWN; // offline: the build itself enforces
  }
}

export function useWalkStatus(): { status: ClientWalkStatus; refresh: () => Promise<ClientWalkStatus> } {
  const [status, setStatus] = useState<ClientWalkStatus>(UNKNOWN);
  const refresh = useCallback(async () => {
    const next = await fetchWalkStatus();
    setStatus(next);
    return next;
  }, []);
  useEffect(() => {
    let live = true;
    void fetchWalkStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return { status, refresh };
}
