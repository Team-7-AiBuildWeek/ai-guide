/**
 * What a walker told us when they signed up: what to call them, and what they
 * like to see — the website's lib/accounts/profile.ts. Kept on their Clerk
 * account (its user-editable metadata), so both devices know it, and copied
 * into the brief every new tour starts from.
 */

import { EMPTY_DRAFT, loadDraft, saveDraft } from "./flow";
import type { Detail, Duration, Interest, Pace } from "./types";

export type Prefs = { interests: Interest[]; detail: Detail; pace: Pace; durationMinutes: Duration };
export type Profile = { name?: string; prefs?: Prefs; onboarded?: boolean };

export function profileOf(user: { unsafeMetadata?: Record<string, unknown> } | null | undefined): Profile {
  const meta = (user?.unsafeMetadata ?? {}) as Profile;
  return { name: meta.name, prefs: meta.prefs, onboarded: meta.onboarded === true };
}

export function applyPrefs(prefs: Prefs | undefined) {
  if (!prefs) return;
  saveDraft({ ...(loadDraft() ?? EMPTY_DRAFT), ...prefs });
}

export function defaultPrefs(): Prefs {
  const d = loadDraft() ?? EMPTY_DRAFT;
  return { interests: d.interests, detail: d.detail, pace: d.pace, durationMinutes: d.durationMinutes };
}
