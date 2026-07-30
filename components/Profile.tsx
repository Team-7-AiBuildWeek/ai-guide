"use client";

/**
 * My profile: the walks somebody has built, and the two settings that outlive
 * any one of them.
 *
 * Everything here is read from the same localStorage the flow writes, so there
 * is no account and nothing leaves the device — which is also why the delete
 * buttons are real deletes rather than a request to a server that may or may
 * not honour them.
 */

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { LANGUAGES, languageName } from "@/lib/i18n/languages";
import { announceUiLang, useT } from "@/lib/i18n/ui";
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/tour/flow";
import {
  formatDistance,
  formatWhen,
  forgetAllWalks,
  forgetWalk,
  loadWalks,
  type WalkRecord,
} from "@/lib/tour/history";
import type { VoiceMode } from "@/lib/audio/useTourAudio";

const VOICE_MODE_KEY = "btour:voice-mode:v1";
const never = () => () => {};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="u-eyebrow">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function Walk({ walk, onForget }: { walk: WalkRecord; onForget: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const minutes = Math.max(1, Math.round(walk.seconds / 60));

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

export default function Profile() {
  const t = useT();
  /**
   * Read once, on the client, and kept in state from there: this is a page
   * about what is already saved, not a live view of it.
   */
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lang, setLang] = useState(EMPTY_DRAFT.lang);

  const hydrate = useCallback(() => {
    setWalks(loadWalks());
    setLang(loadDraft()?.lang ?? EMPTY_DRAFT.lang);
    setLoaded(true);
  }, []);

  // localStorage is unreadable while this renders on the server.
  useSyncExternalStore(
    never,
    () => {
      if (!loaded) queueMicrotask(hydrate);
      return loaded;
    },
    () => false,
  );

  const voice = useSyncExternalStore(
    never,
    () => (localStorage.getItem(VOICE_MODE_KEY) === "device" ? "device" : "guide") as VoiceMode,
    () => "guide" as VoiceMode,
  );

  const setVoice = (mode: VoiceMode) => {
    try {
      localStorage.setItem(VOICE_MODE_KEY, mode);
    } catch {
      /* private mode */
    }
    // Nothing subscribes to this key, so the page has to redraw itself.
    setWalks((w) => [...w]);
  };

  const setDefaultLang = (next: string) => {
    setLang(next);
    saveDraft({ ...(loadDraft() ?? EMPTY_DRAFT), lang: next });
    // One setting, two jobs: the tour is written in it and the app is read in
    // it. Everything showing text hears about it at once.
    announceUiLang(next);
  };

  const walked = walks.reduce((m, w) => m + w.meters, 0);
  const stops = walks.reduce((n, w) => n + w.stopNames.length, 0);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn btn--quiet shrink-0 px-4" aria-label="Back to the map">
          ←
        </Link>
        <h1 className="text-[length:var(--text-h2)]">{t("profile.title")}</h1>
      </header>

      {/* The three numbers worth having: what all of this adds up to. */}
      <section className="flex flex-wrap gap-6 rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
        <Stat label={t("profile.built")} value={String(walks.length)} />
        <Stat label={t("profile.stops")} value={String(stops)} />
        <Stat label={t("profile.distance")} value={formatDistance(walked)} />
      </section>

      <section>
        <h2 className="text-[length:var(--text-h3)]">{t("profile.settings")}</h2>
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {t("profile.settingsHint")}
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor="profile-lang" className="u-eyebrow">
            {t("brief.language")}
          </label>
          <select
            id="profile-lang"
            value={lang}
            onChange={(e) => setDefaultLang(e.target.value)}
            className="min-h-[44px] max-w-[60%] rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[length:var(--text-body)] text-[color:var(--ink)]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.endonym === l.english ? l.endonym : `${l.endonym} — ${l.english}`}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="u-eyebrow">{t("profile.voice")}</p>
          <div className="flex gap-2">
            {(
              [
                ["guide", t("profile.voiceGuide")],
                ["device", t("profile.voicePhone")],
              ] as [VoiceMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={voice === mode}
                onClick={() => setVoice(mode)}
                className="pill"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {t("profile.voiceHint")}
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[length:var(--text-h3)]">{t("profile.past")}</h2>
          {walks.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                forgetAllWalks();
                setWalks([]);
              }}
              className="min-h-[44px] text-[length:var(--text-caption)] font-semibold text-[color:var(--ink-mute)] underline underline-offset-4"
            >
              {t("profile.clearAll")}
            </button>
          ) : null}
        </div>

        {walks.length === 0 ? (
          <p className="mt-3 text-[color:var(--ink-soft)]">
            {loaded ? t("profile.empty") : "…"}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {walks.map((w) => (
              <Walk key={w.at} walk={w} onForget={() => setWalks(forgetWalk(w.at))} />
            ))}
          </ul>
        )}
      </section>

      {/* Every setting here is already saved — it is written the moment it is
          touched, and there is no server to send it to. This says so and takes
          you back, because a settings page with no save button reads as one
          that has not saved. */}
      <Link href="/" className="btn btn--primary btn--lg w-full">
        {t("profile.save")}
      </Link>
    </main>
  );
}
