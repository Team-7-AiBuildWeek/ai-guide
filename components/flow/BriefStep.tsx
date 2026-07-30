"use client";

/**
 * Step 2: what do you want to see.
 *
 * Free text is the default because it produces a better tour than any set of
 * sliders. The sliders are the escape hatch for people who would rather not
 * write anything — both views fill the same draft, and switching between them
 * keeps whatever was already entered.
 */

import { useState } from "react";
import {
  DETAILS,
  DURATIONS,
  EXAMPLE_BRIEFS,
  INTERESTS,
  PACES,
  type Draft,
} from "@/lib/tour/flow";
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
  const simple = draft.useSimpleSettings;
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

  return (
    <div className="flex flex-col gap-7">
      {/* First, and outside both branches: the language decides what the whole
          walk is written and spoken in, whichever way the brief is given — and
          somebody who does not read English needs to find it before they read
          anything else. */}
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

      {simple ? (
        <>
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
        </>
      ) : (
        <>
          <div>
            <label
              htmlFor="brief"
              className="block font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]"
            >
              What do you want to see? Tell me in your own words.
            </label>
            <textarea
              id="brief"
              rows={5}
              value={draft.freeText}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Old town history, not too much walking, something about the coronations"
              className="mt-3 w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-4 text-[length:var(--text-body)] leading-relaxed text-[color:var(--ink)] placeholder:text-[color:var(--ink-mute)]"
            />
          </div>

          {/* The duration lives here too, and not only in the simple settings.
              Without it "I have all afternoon" went into the brief while the
              request still said forty-five minutes, and the walk came back a
              third of the length asked for. */}
          <div>
            <WordSlider
              label="How long"
              options={DURATIONS}
              value={draft.durationMinutes}
              onChange={(v) => onChange({ durationMinutes: v })}
            />
            {readFromBrief ? (
              <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
                Read from what you wrote — change it if that is not right.
              </p>
            ) : null}
          </div>

          <div>
            <p className="u-eyebrow">Or start from one of these</p>
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
        </>
      )}

      <div className="flex flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onContinue} className="btn btn--primary btn--lg w-full">
          Continue
        </button>
        <button
          type="button"
          onClick={() => onChange({ useSimpleSettings: !simple })}
          className="min-h-[44px] text-center font-[family-name:var(--font-display)] font-medium text-[color:var(--mint-ink)] underline underline-offset-4"
        >
          {simple ? "Or describe it in your own words" : "Or use simple settings"}
        </button>
      </div>
    </div>
  );
}
