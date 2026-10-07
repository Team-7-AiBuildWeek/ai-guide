"use client";

/**
 * Step 2: what do you want to see.
 *
 * Ordered by how much each answer changes the walk, the way AllTrails puts
 * length first and Airbnb puts the filters most people use at the top:
 *
 *   How long → What interests you → Style → Anything else → Narration
 *
 * The length is the hard limit and the interests carry most of what makes a
 * walk personal, so they come first. The language is set once and remembered,
 * so it is a small row at the bottom rather than the first thing on the screen.
 *
 * Every setting shows what it does. The footer counts the stops and the
 * distance as they change — Komoot's trick of turning a fitness slider into a
 * time estimate — and the style note puts minutes on detail and pace. The
 * numbers come from lib/tour/shape.ts, the same calculation the planner uses,
 * so the estimate is the walk that gets planned.
 */

import { DETAILS, DURATIONS, EMPTY_DRAFT, INTERESTS, PACES, type Draft } from "@/lib/tour/flow";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useT, type UiKey } from "@/lib/i18n/ui";
import type { Detail, Interest, Pace } from "@/lib/providers/types";
import { parseDuration } from "@/lib/tour/duration";
import { SCRIPT_MINUTES, WALK_MINUTES, tourShape } from "@/lib/tour/shape";
import { useState } from "react";
import Segmented from "./Segmented";

/** Phrases a tap adds to the free-text box — NN/g's prompt suggestions. */
const SUGGESTIONS: UiKey[] = [
  "suggest.kids",
  "suggest.stepFree",
  "suggest.crowds",
  "suggest.coffee",
  "suggest.photos",
  "suggest.rain",
];

/**
 * The way on across the whole width, with the estimate and Reset on the line
 * above it. The button says where it goes ("choose where to start") rather
 * than "plan the walk", because the next screen asks a question rather than
 * planning anything.
 *
 * Reset puts the defaults back rather than emptying the screen, and stays a
 * text link above the button: the bottom edge is the easiest thing to hit by
 * accident, and it should not be the control that throws the brief away.
 *
 * Rendered by the sheet, below the scrolling content, rather than stuck to the
 * bottom of it. As a `sticky` element inside the scroll box the container's
 * own bottom padding stayed underneath it, and the content could be seen
 * sliding through that gap.
 */
export function BriefFooter({
  draft,
  onChange,
  onContinue,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onContinue: () => void;
}) {
  const t = useT();
  const shape = tourShape(draft);
  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="flex min-h-[36px] items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="min-w-0 truncate font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-medium tabular-nums text-[color:var(--ink)]"
        >
          {t(`durationShort.${draft.durationMinutes}`)} · {t("brief.estimate", { stops: shape.stops, km: shape.km })}
        </p>
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
          className="min-h-[36px] shrink-0 font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-medium text-[color:var(--ink-mute)] underline underline-offset-4"
        >
          {t("brief.reset")}
        </button>
      </div>
      <button type="button" onClick={onContinue} className="btn btn--primary btn--lg w-full font-semibold">
        <span className="truncate">{t("brief.next")}</span>
      </button>
    </div>
  );
}

/** The interest chips, as a row: shared with the get-to-know-you screen. */
export function InterestPills({
  value,
  onChange,
  className = "",
}: {
  value: Interest[];
  onChange: (next: Interest[]) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {INTERESTS.map((i) => {
        const on = value.includes(i.value);
        return (
          <button
            key={i.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i.value) : [...value, i.value])}
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
  );
}

/** The words a suggestion adds, and the box with them taken out again. */
function hasPhrase(text: string, phrase: string) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}
function withPhrase(text: string, phrase: string) {
  const trimmed = text.trim().replace(/[,.]$/, "");
  return trimmed ? `${trimmed}, ${phrase.toLowerCase()}` : phrase;
}
function withoutPhrase(text: string, phrase: string) {
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return text;
  return (text.slice(0, at) + text.slice(at + phrase.length))
    .replace(/\s*,\s*,/g, ",")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim();
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
   * Typing the brief also sets the length, when the brief says one.
   *
   * The chips move as they write rather than the duration being inferred
   * invisibly at generation time: the walker can see what was understood and
   * overrule it, and a wrong guess costs a tap instead of a wrong tour.
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

  const picked = draft.interests.length;

  return (
    <div className="flex flex-col gap-6">
      <p className="u-eyebrow -mb-3">{t("brief.step")}</p>

      {/* Tap options rather than a stepper, like GetYourGuide's duration
          filter: seven lengths fit on screen, and every one is visible. */}
      <section>
        <h3 className="u-eyebrow">{t("brief.howLong")}</h3>
        <div role="group" aria-label={t("brief.howLong")} className="mt-2 flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={draft.durationMinutes === d.value}
              aria-label={t(`duration.${d.value}`)}
              onClick={() => {
                onChange({ durationMinutes: d.value });
                setReadFromBrief(false);
              }}
              className="pill tabular-nums"
            >
              {t(`durationShort.${d.value}`)}
            </button>
          ))}
        </div>
        {readFromBrief ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {t("brief.readFromBrief", { length: t(`duration.${draft.durationMinutes}`) })}
          </p>
        ) : null}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="u-eyebrow">{t("brief.interests")}</h3>
          {picked > 0 ? (
            <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[color:var(--ink-mute)]">
              {t("brief.interestsCount", { n: picked })}
            </span>
          ) : null}
        </div>
        <InterestPills value={draft.interests} onChange={(interests) => onChange({ interests })} className="mt-2" />
        {picked === 0 ? (
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {t("brief.interestsNone")}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="u-eyebrow">{t("brief.style")}</h3>
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
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {t("brief.styleNote", { listen: SCRIPT_MINUTES[draft.detail], walk: WALK_MINUTES[draft.pace] })}
        </p>
      </section>

      {/* Always open: behind a button it was the most useful box on the screen
          and the one most people never saw. The suggestions add a few words
          rather than a whole sentence, so they shape what is written instead
          of replacing it, and tapping one again takes its words back out. */}
      <section>
        <label htmlFor="brief" className="u-eyebrow block">
          {t("brief.anythingElse")}
        </label>
        <textarea
          id="brief"
          rows={2}
          value={draft.freeText}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Old town history, not too much walking, something about the coronations"
          className="mt-2 w-full resize-none rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-3 text-[length:var(--text-body)] leading-relaxed text-[color:var(--ink)] [field-sizing:content] placeholder:text-[color:var(--ink-mute)]"
        />
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {t("brief.anythingElseHint")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((key) => {
            const phrase = t(key);
            const on = hasPhrase(draft.freeText, phrase);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setBrief(on ? withoutPhrase(draft.freeText, phrase) : withPhrase(draft.freeText, phrase))
                }
                className="pill"
              >
                <span aria-hidden="true">{on ? "✓" : "+"}</span>
                {phrase}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4">
        <label htmlFor="tour-lang" className="u-eyebrow">
          {t("brief.narration")}
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
    </div>
  );
}
