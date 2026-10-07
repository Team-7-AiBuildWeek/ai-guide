"use client";

/** One past walk, folded: what it was; opened: its stops, walk it again, delete it. */

import { useState } from "react";
import Stat from "./Stat";
import { LANGUAGES, languageName } from "@/lib/i18n/languages";
import { useT } from "@/lib/i18n/ui";
import { saveRebuild } from "@/lib/tour/flow";
import { canWalkAgain, formatDistance, formatWhen, planFor, type WalkRecord } from "@/lib/tour/history";

export default function WalkCard({ walk, onForget }: { walk: WalkRecord; onForget: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const minutes = Math.max(1, Math.round(walk.seconds / 60));

  /**
   * The language this walk is about to be repeated in.
   *
   * Starts on the one it was built in, so the button is honest before it is
   * touched: pressing it without opening the picker walks the same walk again,
   * exactly as it was.
   */
  const [againLang, setAgainLang] = useState(walk.lang);
  const again = canWalkAgain(walk);

  const walkAgain = () => {
    const plan = planFor(walk);
    if (!walk.req || !plan) return;
    saveRebuild({ req: { ...walk.req, lang: againLang }, plan });
    // A full navigation rather than a client one: the flow reads the ask on
    // mount, and a soft push would land on a TourFlow that has already
    // mounted and already looked.
    window.location.href = "/";
  };

  return (
    <li className="rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
            {walk.title}
          </span>
          <span className="mt-1 block text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {[
              walk.city,
              formatWhen(walk.at, walk.lang),
              `${walk.stopNames.length} ${t("profile.stops").toLowerCase()}`,
              formatDistance(walk.meters),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[color:var(--ink-mute)]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-6">
            <Stat label={t("profile.askedFor")} value={`${walk.minutes} min`} />
            <Stat label={t("profile.walking")} value={`${minutes} min`} />
            <Stat label={t("brief.language")} value={languageName(walk.lang)} />
          </div>

          {walk.freeText ? (
            <p className="mt-4 rounded-[var(--radius-control)] bg-[color:var(--canvas)] p-3 text-[length:var(--text-caption)] italic text-[color:var(--ink-soft)]">
              “{walk.freeText}”
            </p>
          ) : null}

          <p className="u-eyebrow mt-4">{t("profile.theStops")}</p>
          <ol className="mt-2 flex flex-col gap-1">
            {walk.stopNames.map((name, i) => (
              <li key={i} className="text-[length:var(--text-caption)] text-[color:var(--ink-soft)]">
                <span className="tabular-nums text-[color:var(--ink-mute)]">{i + 1}.</span> {name}
              </li>
            ))}
          </ol>

          {/* Walking it again. The language sits next to the button rather
              than behind a second screen, because changing it is the whole
              reason the button is interesting — the same walk in a language
              you are learning, or one a visitor reads. */}
          {again ? (
            <div className="mt-4 rounded-[var(--radius-control)] bg-[color:var(--canvas)] p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="u-eyebrow">{t("brief.language")}</span>
                <select
                  value={againLang}
                  onChange={(e) => setAgainLang(e.target.value)}
                  className="min-h-[44px] max-w-[60%] rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--ink)]"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.endonym === l.english ? l.endonym : `${l.endonym} — ${l.english}`}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={walkAgain} className="btn btn--filled mt-3 w-full">
                {t("profile.walkAgain")}
              </button>
              <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
                {t("profile.walkAgainHint")}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onForget}
            className="mt-4 min-h-[44px] font-[family-name:var(--font-display)] text-[length:var(--text-caption)] font-semibold text-[color:var(--danger)] underline underline-offset-4"
          >
            {t("profile.deleteOne")}
          </button>
        </div>
      ) : null}
    </li>
  );
}
