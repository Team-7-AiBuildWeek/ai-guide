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
  EXAMPLE_BRIEFS,
  INTERESTS,
  PACES,
  type Draft,
} from "@/lib/tour/flow";
import { LANGUAGES } from "@/lib/i18n/languages";
import type { Detail, Interest, Pace } from "@/lib/providers/types";
import { parseDuration } from "@/lib/tour/duration";
import Segmented from "./Segmented";
import Stepper from "./Stepper";


export default function BriefStep({
  draft,
  onChange,
  onContinue,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onContinue: () => void;
}) {
  const [readFromBrief, setReadFromBrief] = useState(false);

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
  const durationLabel = DURATIONS[durationIndex]?.label;

  return (
    <div className="flex flex-col gap-4">
      {/* First, and above everything: the language decides what the whole walk
          is written and spoken in, and somebody who does not read English
          needs it before they read anything else. */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="tour-lang" className="u-eyebrow">
          Language
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
          label="How long"
          value={durationLabel ?? `${draft.durationMinutes} minutes`}
          atMin={durationIndex <= 0}
          atMax={durationIndex >= DURATIONS.length - 1}
          onStep={(d) => {
            const next = DURATIONS[Math.min(DURATIONS.length - 1, Math.max(0, durationIndex + d))];
            if (next) onChange({ durationMinutes: next.value });
          }}
        />
        <Segmented
          label="How much detail"
          options={DETAILS}
          value={draft.detail}
          onChange={(v) => onChange({ detail: v as Detail })}
        />
        <Segmented
          label="Pace"
          options={PACES}
          value={draft.pace}
          onChange={(v) => onChange({ pace: v as Pace })}
        />
      </div>

      <div>
        <p className="u-eyebrow">What interests you</p>
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
                {i.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The seam. Everything above answers the questions; everything below
          replaces them with a sentence, for anyone who would rather say what
          they mean than approximate it with three sliders. */}
      <div className="border-t border-[color:var(--line)] pt-4">
        <label
          htmlFor="brief"
          className="block font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]"
        >
          Or tell me in your own words
        </label>
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Anything here outranks the settings above. It makes the better tour.
        </p>
        <textarea
          id="brief"
          rows={3}
          value={draft.freeText}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Old town history, not too much walking, something about the coronations"
          className="mt-3 w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-3 text-[length:var(--text-body)] leading-relaxed text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        {readFromBrief && durationLabel ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Length set to {durationLabel.toLowerCase()} from what you wrote — change it above if
            that is not right.
          </p>
        ) : null}

        {/* Four full-width rows of prose spent about a fifth of the whole
            screen on examples nobody reads twice. As chips they are still
            one tap, and they wrap into a third of the space. */}
        <p className="u-eyebrow mt-4">Or start from one of these</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLE_BRIEFS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setBrief(ex)}
              title={ex}
              className="pill max-w-full"
            >
              <span className="truncate">{ex.split(",")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Airbnb's filter footer: the way out of every choice on the left as
          plain text, the way on to the right as the only filled button on the
          screen — and it names what you are about to get rather than saying
          "continue", so the settings above have a visible consequence. Sticky,
          because the screen is longer than a phone. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 flex items-center justify-between gap-3 border-t border-[color:var(--line)] bg-[color:var(--surface)] px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
          Clear all
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="btn btn--primary min-w-0 px-6 font-semibold"
        >
          <span className="truncate">Plan {DURATIONS[durationIndex]?.walk ?? "the walk"}</span>
        </button>
      </div>
    </div>
  );
}
