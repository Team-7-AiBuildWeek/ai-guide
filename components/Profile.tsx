"use client";

/**
 * The Account tab: what all the walks add up to, the account (when accounts
 * are on), and the settings every new walk starts from. The walks themselves
 * are on the Tours tab.
 */

import AccountMenu from "./AccountMenu";
import { ABOVE_TAB_BAR } from "./TabBar";
import { useState } from "react";
import Stat from "./Stat";
import { useLoadOnce } from "@/lib/useLoadOnce";
import { announceUiLang, useT } from "@/lib/i18n/ui";
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/tour/flow";
import { formatDistance, loadWalks, type WalkRecord } from "@/lib/tour/history";

export default function Profile() {
  const t = useT();
  /**
   * Read once, on the client, and kept in state from there: this is a page
   * about what is already saved, not a live view of it.
   */
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [lang, setLang] = useState(EMPTY_DRAFT.lang);
  useLoadOnce(() => {
    setWalks(loadWalks());
    setLang(loadDraft()?.lang ?? EMPTY_DRAFT.lang);
  });

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
    <main
      className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ paddingBottom: `calc(${ABOVE_TAB_BAR} + 2rem)` }}
    >
      <header>
        <h1 className="text-[length:var(--text-h2)]">Account</h1>
      </header>

      {/* The three numbers worth having: what all of this adds up to. */}
      <section className="flex flex-wrap gap-6 rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
        <Stat label={t("profile.built")} value={String(walks.length)} />
        <Stat label={t("profile.stops")} value={String(stops)} />
        <Stat label={t("profile.distance")} value={formatDistance(walked)} />
      </section>

      <AccountMenu lang={lang} onLang={setDefaultLang} onWalks={setWalks} />
    </main>
  );
}
