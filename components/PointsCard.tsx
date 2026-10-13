"use client";

/**
 * "Points" on the Account tab (lib/billing/loyalty.ts): the balance and how far
 * it is to the next free walk, the tier, the cities walked, the invite link —
 * and spending 500 points on a walk. Hidden unless points are switched on and
 * the walker is signed in.
 */

import { useEffect, useState } from "react";
import { claimReferralIfAny } from "@/lib/billing/referral";

type Loyalty = {
  enabled: boolean;
  balance?: number;
  walksCompleted?: number;
  tier?: string;
  nextTier?: { name: string; walksToGo: number } | null;
  cities?: string[];
  referralCode?: string;
  pointsPerReward?: number;
};

export default function PointsCard() {
  const [data, setData] = useState<Loyalty | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/me/loyalty", { cache: "no-store" });
      setData(res.ok ? ((await res.json()) as Loyalty) : null);
    } catch {
      setData(null);
    }
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      await claimReferralIfAny();
      const res = await fetch("/api/me/loyalty", { cache: "no-store" }).catch(() => null);
      if (live) setData(res?.ok ? ((await res.json()) as Loyalty) : null);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!data?.enabled || data.balance === undefined) return null;
  const per = data.pointsPerReward ?? 500;
  const toward = Math.max(0, data.balance) % per;
  const rewards = Math.floor(Math.max(0, data.balance) / per);
  const invite = typeof window !== "undefined" && data.referralCode ? `${location.origin}/?ref=${data.referralCode}` : "";

  const redeem = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/me/points/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: crypto.randomUUID() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setNote(res.ok ? "One walk added — it's yours to use any time." : body.error ?? "Couldn't use your points.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "WalkDots", text: "Audio walks built around what you want to see.", url: invite });
      else {
        await navigator.clipboard.writeText(invite);
        setNote("Invite link copied.");
      }
    } catch {
      /* closed the share sheet */
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="u-eyebrow">Points</h2>
        <span className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{data.tier}</span>
      </div>
      <p className="font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-semibold text-[color:var(--ink)]">
        {data.balance} points
      </p>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--line)]" aria-hidden="true">
          <div className="h-full rounded-full bg-[color:var(--mint)]" style={{ width: `${(toward / per) * 100}%` }} />
        </div>
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {rewards > 0 ? `Enough for ${rewards} free walk${rewards === 1 ? "" : "s"}. ` : ""}
          {per - toward} points to {rewards > 0 ? "the next one" : "a free walk"} · 50 for each paid walk you finish
        </p>
      </div>
      <p className="text-[length:var(--text-caption)] text-[color:var(--ink-soft)]">
        {data.walksCompleted} walk{data.walksCompleted === 1 ? "" : "s"} completed
        {data.nextTier ? ` · ${data.nextTier.walksToGo} more to ${data.nextTier.name}` : ""}
        {data.cities?.length ? ` · ${data.cities.join(", ")}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {rewards > 0 ? (
          <button type="button" disabled={busy} onClick={() => void redeem()} className="btn btn--primary btn--small">
            {busy ? "Adding…" : `Use ${per} points for a walk`}
          </button>
        ) : null}
        {invite ? (
          <button type="button" onClick={() => void share()} className="btn btn--quiet btn--small">
            Invite a friend · 500 points each
          </button>
        ) : null}
      </div>
      {note ? <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{note}</p> : null}
    </section>
  );
}
