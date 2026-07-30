"use client";

/**
 * Step 2: what do you want to see.
 *
 * One screen, in the order the questions actually get asked. The settings come
 * first because they are answerable without writing anything — a walker who
 * only drags three sliders gets a real tour. Scrolling past them reaches the
 * box where the tour is described in words, which produces the better walk and
 * outranks the sliders wherever the two disagree.
 *
 * It used to be two views behind a toggle. That made them look like
 * alternatives, so whichever one you were not looking at may as well not have
 * existed — and the writing, which is the thing worth doing, was the one
 * hidden behind the link.
 */

import { useState } from "react";
import { DETAILS, DURATIONS, EXAMPLE_BRIEFS, INTERESTS, PACES, type Draft } from "@/lib/tour/flow";
import { LANGUAGES } from "@/lib/i18n/languages";
import type { Detail, Interest, Pace } from "@/lib/providers/types";
import { parseDuration } from "@/lib/tour/duration";

/** A slider whose value reads as words, not a number. */
function WordSlider<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-eyebrow">{label}</span>
        <span className="font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
          {options[index]?.label}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(options[Number(e.target.value)].value)}
        aria-label={label}
        className="mt-3 h-11 w-full accent-[color:var(--mint-ink)]"
      />
    </div>
  );
}

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
  const durationLabel = DURATIONS.find((d) => d.value === draft.durationMinutes)?.label;

  return (
    <div className="flex flex-col gap-7">
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

      <div className="flex flex-col gap-8">
        <WordSlider
          label="How long"
          options={DURATIONS}
          value={draft.durationMinutes}
          onChange={(v) => onChange({ durationMinutes: v })}
        />
        <WordSlider
          label="How much detail"
          options={DETAILS}
          value={draft.detail}
          onChange={(v) => onChange({ detail: v as Detail })}
        />
        <WordSlider
          label="Pace"
          options={PACES}
          value={draft.pace}
          onChange={(v) => onChange({ pace: v as Pace })}
        />
      </div>

      <div>
        <p className="u-eyebrow">What interests you</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = draft.interests.includes(i.value);
            return (
              <button
                key={i.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleInterest(i.value)}
                className={`btn ${on ? "btn--primary" : "btn--quiet"}`}
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
      <div className="border-t border-[color:var(--line)] pt-7">
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
          rows={5}
          value={draft.freeText}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Old town history, not too much walking, something about the coronations"
          className="mt-3 w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-4 text-[length:var(--text-body)] leading-relaxed text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
        />
        {readFromBrief && durationLabel ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Length set to {durationLabel.toLowerCase()} from what you wrote — change it above if
            that is not right.
          </p>
        ) : null}

        <p className="u-eyebrow mt-6">Or start from one of these</p>
        <div className="mt-3 flex flex-col gap-2">
          {EXAMPLE_BRIEFS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setBrief(ex)}
              className="rounded-[var(--radius-control)] border border-[color:var(--line)] bg-[color:var(--canvas)] px-4 py-3 text-left text-[color:var(--ink-soft)] hover:border-[color:var(--ink-mute)]"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky, because the screen is now long enough that a walker who only
          wanted the sliders would otherwise have to scroll past the whole
          writing section to find the way on. */}
      <div className="sticky bottom-0 -mx-5 -mb-6 mt-1 border-t border-[color:var(--line)] bg-[color:var(--surface)] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onContinue} className="btn btn--primary btn--lg w-full">
          Continue
        </button>
      </div>
    </div>
  );
}
