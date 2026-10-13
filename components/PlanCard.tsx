"use client";

/**
 * "Your walks" on the Account tab: what this person can still build — the free
 * walk, walks bought, a pass and how long it runs, the annual plan — and the
 * way to get more or manage the plan. Hidden entirely while the paywall does
 * not apply (lib/billing/mode.ts), so nothing about paying shows before it is
 * switched on.
 */

import { useState } from "react";
import Paywall from "./Paywall";
import { useWalkStatus } from "@/lib/billing/useWalkStatus";
import { PRODUCTS } from "@/lib/billing/products";

function until(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PlanCard() {
  const { status, refresh } = useWalkStatus();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status.enabled) return null;

  const lines: string[] = [];
  if (status.freeWalkLeft) lines.push("Your first walk is free.");
  if (status.pass) {
    const name = PRODUCTS.find((p) => p.id === status.pass!.kind)?.name ?? "Pass";
    lines.push(`${name} until ${until(status.pass.until)} · ${status.pass.usedToday} of ${status.pass.perDay} walks used today`);
  }
  if (status.annual) {
    lines.push(
      `Annual plan · ${status.annual.usedThisMonth} of ${status.annual.perMonth} walks this month · ${
        status.annual.cancelling ? "ends" : "renews"
      } ${new Date(status.annual.until).toLocaleDateString()}`,
    );
  }
  const walks = (status.credits ?? 0) + (status.bonusCredits ?? 0);
  if (walks > 0) lines.push(`${walks} walk${walks === 1 ? "" : "s"} to use any time`);
  if (lines.length === 0) lines.push(status.signedIn ? "No walks left — get more whenever you're ready." : "Sign in to see your walks.");

  const manage = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't open your plan.");
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open your plan.");
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
      <h2 className="u-eyebrow">Your walks</h2>
      <ul className="flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l} className="text-[color:var(--ink)]">
            {l}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPaywallOpen(true)} className="btn btn--primary btn--small">
          Get more walks
        </button>
        {status.annual ? (
          <button type="button" disabled={busy} onClick={() => void manage()} className="btn btn--quiet btn--small">
            {busy ? "Opening…" : "Manage plan"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{error}</p> : null}
      <Paywall
        open={paywallOpen}
        reason={status.signedIn ? "no_walks" : "signin"}
        status={status}
        onClose={() => setPaywallOpen(false)}
        onStatus={() => void refresh()}
      />
    </section>
  );
}
