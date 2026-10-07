"use client";

/**
 * What a walker told us when they signed up: what to call them, and what they
 * like to see. Kept on their Clerk account (in its user-editable metadata), so
 * the phone and the website both know it, and copied into the brief every new
 * tour starts from.
 */

import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/tour/flow";
import type { Detail, Duration, Interest, Pace } from "@/lib/providers/types";

export type Prefs = {
  interests: Interest[];
  detail: Detail;
  pace: Pace;
  durationMinutes: Duration;
};

export type Profile = { name?: string; prefs?: Prefs; onboarded?: boolean };

/** The account's profile, from Clerk's unsafeMetadata (the walker's own to edit). */
export function profileOf(user: { unsafeMetadata?: Record<string, unknown> } | null | undefined): Profile {
  const meta = (user?.unsafeMetadata ?? {}) as Profile;
  return { name: meta.name, prefs: meta.prefs, onboarded: meta.onboarded === true };
}

/** The preferences become the starting point of every new brief on this device. */
export function applyPrefs(prefs: Prefs | undefined) {
  if (!prefs) return;
  saveDraft({ ...(loadDraft() ?? EMPTY_DRAFT), ...prefs });
}

export function defaultPrefs(): Prefs {
  const d = loadDraft() ?? EMPTY_DRAFT;
  return { interests: d.interests, detail: d.detail, pace: d.pace, durationMinutes: d.durationMinutes };
}
