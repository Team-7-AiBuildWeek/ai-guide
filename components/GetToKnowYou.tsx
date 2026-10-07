"use client";

/**
 * "Get to know you": the two short questions after a new walker confirms their
 * email. What to call them, and a small version of the tour settings — the
 * things they like and how much detail. (Length and pace are asked per tour.) Both go on their
 * account and become where every new tour starts. Same screens as the iPhone
 * app (mobile/src/components/GetToKnowYou.tsx).
 */

import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { InterestPills } from "./flow/BriefStep";
import Segmented from "./flow/Segmented";
import { applyPrefs, defaultPrefs, profileOf, type Prefs } from "@/lib/accounts/profile";
import { useT } from "@/lib/i18n/ui";
import { DETAILS } from "@/lib/tour/flow";
import type { Detail } from "@/lib/providers/types";

function Progress({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-[color:var(--mint)]" : "bg-[color:var(--line)]"}`}
        />
      ))}
    </div>
  );
}

export default function GetToKnowYou({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { user } = useUser();
  const known = profileOf(user);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(known.name ?? user?.firstName ?? "");
  const [prefs, setPrefs] = useState<Prefs>(known.prefs ?? defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<Prefs>) => setPrefs((x) => ({ ...x, ...p }));

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await user?.update({
        unsafeMetadata: { ...(user.unsafeMetadata ?? {}), name: name.trim() || undefined, prefs, onboarded: true },
      });
      applyPrefs(prefs);
      onDone();
    } catch {
      setError("Could not save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (step === 1) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setStep(2);
        }}
      >
        <Progress step={1} />
        <p className="u-eyebrow mt-2">Get to know you</p>
        <h2 className="text-[length:var(--text-h3)]">What should we call you?</h2>
        <p>The guide will use it now and then. You can leave it empty.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          autoFocus
          placeholder="Your first name"
          aria-label="Your first name"
          className="min-h-[52px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        <button type="submit" className="btn btn--primary btn--lg w-full">
          Continue
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Progress step={2} />
      <div>
        <p className="u-eyebrow">Get to know you</p>
        <h2 className="mt-1 text-[length:var(--text-h3)]">{name.trim() ? `What do you like to see, ${name.trim()}?` : "What do you like to see?"}</h2>
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Every new tour starts from this. You can change it each time.
        </p>
      </div>
      {/* The sheet stops at the screen's top; the choices scroll inside it. */}
      <div className="-mx-1 flex max-h-[46dvh] flex-col gap-4 overflow-y-auto px-1">
        <InterestPills value={prefs.interests} onChange={(interests) => patch({ interests })} />
        <Segmented
          label={t("brief.detail")}
          options={DETAILS.map((d) => ({ value: d.value, label: t(`detail.${d.value}`) }))}
          value={prefs.detail}
          onChange={(v) => patch({ detail: v as Detail })}
        />
      </div>
      {error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{error}</p> : null}
      <button type="button" disabled={saving} onClick={() => void finish()} className="btn btn--primary btn--lg w-full">
        {saving ? "Saving…" : "Start walking"}
      </button>
      <button
        type="button"
        onClick={() => setStep(1)}
        className="min-h-[44px] self-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
      >
        Back
      </button>
    </div>
  );
}
