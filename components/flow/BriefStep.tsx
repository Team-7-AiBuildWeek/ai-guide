"use client";

/**
 * Step 2: what do you want to see.
 *
 * One screen, in the order the questions actually get asked. The settings come
 * first because they are answerable without writing anything — three taps and
 * a walker has a real tour. Scrolling past them reaches the box where the tour
 * is described in words, which produces the better walk and outranks the
 * settings wherever the two disagree.
 *
 * The controls are Airbnb's, from their filter sheet: a stepper for the value
 * with too many options to name, segmented rows for the ones with three, pills
 * for the multi-select, and a footer holding the way out of everything on the
 * left and the way on to the right.
 *
 * It used to be two views behind a toggle. That made them look like
 * alternatives, so whichever one you were not looking at may as well not have
 * existed — and the writing, which is the thing worth doing, was the one
 * hidden behind the link.
 */

import { useState } from "react";
import {
  DETAILS,
  DURATIONS,
  EMPTY_DRAFT,
  INTERESTS,
  PACES,
  type Draft,
} from "@/lib/tour/flow";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useT } from "@/lib/i18n/ui";
import type { Detail, Interest, Pace } from "@/lib/providers/types";
import { parseDuration } from "@/lib/tour/duration";
import Segmented from "./Segmented";
import Stepper from "./Stepper";


/**
 * Airbnb's filter footer: the way out of every choice on the left as plain
 * text, the way on to the right as the only filled button on the screen — and
 * it names what it will make rather than saying "continue", so the settings
 * above have a visible consequence.
 *
 * Rendered by the sheet, below the scrolling content, rather than stuck to the
 * bottom of it. As a `sticky` element inside the scroll box the container's
 * own bottom padding stayed underneath it, and the content could be seen
 * sliding through that gap.
 */
export function BriefFooter({
  onChange,
  onContinue,
}: {
  onChange: (patch: Partial<Draft>) => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() =>
          onChange({
            freeText: "",
            durationMinutes: EMPTY_DRAFT.durationMinutes,
            detail: EMPTY_DRAFT.detail,
            pace: EMPTY_DRAFT.pace,
            interests: EMPTY_DRAFT.interests,
          })
        }
        className="min-h-[44px] shrink-0 font-[family-name:var(--font-display)] font-medium text-[color:var(--ink)] underline underline-offset-4"
      >
        {t("brief.clearAll")}
      </button>
      <button
        type="button"
        onClick={onContinue}
        className="btn btn--primary min-w-0 px-6 font-semibold"
      >
        <span className="truncate">{t("brief.plan")}</span>
      </button>
    </div>
  );
}

export default function BriefStep({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const t = useT();
  const [readFromBrief, setReadFromBrief] = useState(false);
  /**
   * Open already if there are words in the draft — coming back to a brief you
   * wrote and finding the box gone reads as having lost it.
   */
  const [personalise, setPersonalise] = useState(() => draft.freeText.trim().length > 0);

  /**
   * Typing the brief also sets the length, when the brief says one.
   *
   * The slider moves as they write rather than the duration being inferred
   * invisibly at generation time: the walker can see what was understood and
   * overrule it, and a wrong guess costs a drag instead of a wrong tour.
   */
  const setBrief = (freeText: string) => {
    const found = parseDuration(freeText);
    if (found !== null && found !== draft.durationMinutes) {
      onChange({ freeText, durationMinutes: found });
      setReadFromBrief(true);
    } else {
      onChange({ freeText });
      if (found === null) setReadFromBrief(false);
    }
  };

  const toggleInterest = (i: Interest) =>
    onChange({
      interests: draft.interests.includes(i)
        ? draft.interests.filter((x) => x !== i)
        : [...draft.interests, i],
    });

  // The slider sits above the box that moved it, so the confirmation has to
  // name the value — by the time you have written "all afternoon" the words
  // for it are off the top of the screen.
  const durationIndex = DURATIONS.findIndex((d) => d.value === draft.durationMinutes);

  return (
    <div className="flex flex-col gap-4">
      {/* First, and above everything: the language decides what the whole walk
          is written and spoken in, and somebody who does not read English
          needs it before they read anything else. */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="tour-lang" className="u-eyebrow">
          {t("brief.language")}
        </label>
        <select
          id="tour-lang"
          value={draft.lang}
          onChange={(e) => onChange({ lang: e.target.value })}
          className="min-h-[44px] max-w-[60%] rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--ink)]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.endonym === l.english ? l.endonym : `${l.endonym} — ${l.english}`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-4">
        <Stepper
          label={t("brief.howLong")}
          value={t(`duration.${draft.durationMinutes}`)}
          atMin={durationIndex <= 0}
          atMax={durationIndex >= DURATIONS.length - 1}
          onStep={(d) => {
            const next = DURATIONS[Math.min(DURATIONS.length - 1, Math.max(0, durationIndex + d))];
            if (next) onChange({ durationMinutes: next.value });
          }}
        />
        <Segmented
          label={t("brief.detail")}
          options={DETAILS.map((d) => ({ value: d.value, label: t(`detail.${d.value}`) }))}
          value={draft.detail}
          onChange={(v) => onChange({ detail: v as Detail })}
        />
        <Segmented
          label={t("brief.pace")}
          options={PACES.map((p) => ({ value: p.value, label: t(`pace.${p.value}`) }))}
          value={draft.pace}
          onChange={(v) => onChange({ pace: v as Pace })}
        />
      </div>

      <div>
        <p className="u-eyebrow">{t("brief.interests")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = draft.interests.includes(i.value);
            return (
              <button
                key={i.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleInterest(i.value)}
                className="pill"
              >
                <span aria-hidden="true" className="pill--icon">
                  {i.icon}
                </span>
                {t(`interest.${i.value}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* The seam. Everything above answers the questions; everything below
          replaces them with a sentence, for anyone who would rather say what
          they mean than approximate it with three settings.
          Behind a button, because it is the longest thing on the screen and
          most walkers never open it — and it opens in place rather than on a
          screen of its own, so the settings it overrules stay right above it. */}
      <div className="border-t border-[color:var(--line)] pt-4">
        <button
          type="button"
          aria-expanded={personalise}
          aria-controls="personalise"
          onClick={() => setPersonalise((v) => !v)}
          className="btn btn--primary btn--lg w-full justify-between text-left"
        >
          <span>{t("brief.personalise")}</span>
          <span aria-hidden="true" className="text-[length:var(--text-caption)]">
            {personalise ? "▲" : "▼"}
          </span>
        </button>
        {!personalise ? (
          <p className="mt-2 text-center text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {draft.freeText.trim() ? t("brief.personaliseSet") : t("brief.personaliseHint")}
          </p>
        ) : null}
      </div>

      {personalise ? (
        <div id="personalise">
          <label
            htmlFor="brief"
            className="block font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]"
          >
            {t("brief.ownWords")}
          </label>
          <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {t("brief.ownWordsHint")}
          </p>
        <textarea
          id="brief"
          rows={3}
          value={draft.freeText}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Old town history, not too much walking, something about the coronations"
          className="mt-3 w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-3 text-[length:var(--text-body)] leading-relaxed text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
          {readFromBrief ? (
            <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
              {t("brief.readFromBrief", { length: t(`duration.${draft.durationMinutes}`) })}
            </p>
          ) : null}

          {/* No canned briefs underneath. Anyone who opened this panel did so to
              write their own sentence, and a row of ready-made ones just below
              the box invited them to tap one instead — a worse brief than the
              chips above, because it overrules them. The placeholder already
              shows the shape of a good one. */}
        </div>
      ) : null}
    </div>
  );
}
