"use client";

/**
 * The Tours tab: the walk you are on, if there is one, and every walk built
 * on this device (and, signed in, on your account). What used to be the bottom
 * half of the profile, given its own place.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Walk } from "./Profile";
import TabBar, { TAB_BAR_PX } from "./TabBar";
import { accountsEnabled, forgetWalkEverywhere } from "@/lib/accounts/client";
import { useT } from "@/lib/i18n/ui";
import { loadTour, requestResume, type StoredTour } from "@/lib/tour/flow";
import { forgetAllWalks, forgetWalk, loadWalks, type WalkRecord } from "@/lib/tour/history";

const never = () => () => {};

export default function Tours() {
  const t = useT();
  const router = useRouter();
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const [current, setCurrent] = useState<StoredTour | null>(null);
  const [loaded, setLoaded] = useState(false);

  // localStorage is unreadable during SSR: read it once, after hydration.
  const hydrate = useCallback(() => {
    setWalks(loadWalks());
    setCurrent(loadTour());
    setLoaded(true);
  }, []);
  useSyncExternalStore(
    never,
    () => {
      if (!loaded) queueMicrotask(hydrate);
      return loaded;
    },
    () => false,
  );

  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ paddingBottom: TAB_BAR_PX + 32 }}
    >
      <header>
        <h1 className="text-[length:var(--text-h2)]">Tours</h1>
      </header>

      {current ? (
        <section className="card flex flex-col gap-3 p-4">
          <p className="u-eyebrow">{t("landing.paused")}</p>
          <h2 className="text-[length:var(--text-h3)]">{current.plan.title}</h2>
          <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {current.plan.stops.length} stops · {current.plan.stops.map((s) => s.name).slice(0, 3).join(", ")}
            {current.plan.stops.length > 3 ? "…" : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              requestResume();
              router.push("/");
            }}
            className="btn btn--primary btn--lg w-full"
          >
            {t("landing.carryOn")}
          </button>
        </section>
      ) : (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-[length:var(--text-h3)]">No walk in progress</h2>
          <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Build one around what you want to see. It takes about a minute.
          </p>
          <button type="button" onClick={() => router.push("/")} className="btn btn--primary btn--lg w-full">
            {t("landing.build")}
          </button>
        </section>
      )}

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
          <p className="mt-3 text-[color:var(--ink-soft)]">{loaded ? t("profile.empty") : "…"}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {walks.map((w) => (
              <Walk
                key={w.at}
                walk={w}
                onForget={() => {
                  setWalks(forgetWalk(w.at));
                  if (accountsEnabled) void forgetWalkEverywhere(w.at);
                }}
              />
            ))}
          </ul>
        )}
      </section>
      <TabBar />
    </main>
  );
}
