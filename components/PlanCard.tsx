"use client";

/**
 * "Subscription" on the Account tab — laid out like the plan card in Spotify,
 * Duolingo or ChatGPT: the plan's name, how much of it is left on a meter,
 * when it ends or renews, and one button (upgrade when free, manage when
 * paid). Paid plans wear the paywall's dark hero colours. Below, as before:: what this person can still build — the free
 * walk, walks bought, a pass and how long it runs, the annual plan — and the
 * way to get more or manage the plan. Hidden entirely while the paywall does
 * not apply (lib/billing/mode.ts), so nothing about paying shows before it is
 * switched on.
 */

import { useState } from "react";
import Paywall from "./Paywall";
import { useWalkStatus, type ClientWalkStatus } from "@/lib/billing/useWalkStatus";
import { PRODUCTS } from "@/lib/billing/products";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "2 days 4 h left", "5 h left", "40 min left". */
function timeLeft(iso: string): string {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""}${h % 24 ? ` ${h % 24} h` : ""} left`;
  if (h >= 1) return `${h} h left`;
  return `${Math.max(1, Math.round(ms / 60_000))} min left`;
}

type Plan = {
  name: string;
  paid: boolean;
  badge: string | null;
  badgeTone: "live" | "ending" | null;
  remaining: number;
  remainingLabel: string;
  /** For "1 of 3" and the meter; null when there is no fixed allowance. */
  total: number | null;
  note: string | null;
  cta: string;
};

/**
 * The card's one plan, from what the account has. A plan with an allowance
 * (annual, pass) leads; walks bought one by one show as "Pay as you go"; with
 * nothing bought it is the free plan, and the free walk is the allowance.
 */
function describe(s: ClientWalkStatus, extra: number): Plan {
  if (s.annual) {
    const n = Math.max(0, s.annual.perMonth - s.annual.usedThisMonth);
    return {
      name: "Annual",
      paid: true,
      badge: s.annual.cancelling ? "Ends" : "Active",
      badgeTone: s.annual.cancelling ? "ending" : "live",
      remaining: n,
      remainingLabel: `walk${n === 1 ? "" : "s"} left this month`,
      total: s.annual.perMonth,
      note: `${s.annual.cancelling ? "Ends" : "Renews"} ${new Date(s.annual.until).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`,
      cta: "Manage subscription",
    };
  }
  if (s.pass) {
    const n = Math.max(0, s.pass.perDay - s.pass.usedToday);
    return {
      name: PRODUCTS.find((p) => p.id === s.pass!.kind)?.name ?? "Pass",
      paid: true,
      badge: "Active",
      badgeTone: "live",
      remaining: n,
      remainingLabel: `walk${n === 1 ? "" : "s"} left today`,
      total: s.pass.perDay,
      note: `${timeLeft(s.pass.until)} · ends ${when(s.pass.until)} · doesn't renew`,
      cta: "Get more walks",
    };
  }
  if (extra > 0) {
    return {
      name: "Pay as you go",
      paid: true,
      badge: null,
      badgeTone: null,
      remaining: extra,
      remainingLabel: `walk${extra === 1 ? "" : "s"} remaining`,
      total: null,
      note: "Bought walks never expire.",
      cta: "Get more walks",
    };
  }
  const free = s.freeWalkLeft ? 1 : 0;
  return {
    name: "Free",
    paid: false,
    badge: null,
    badgeTone: null,
    remaining: free,
    remainingLabel: `free walk${free === 1 ? "" : "s"} remaining`,
    total: 1,
    note: free ? "Passes from €9.99 · Annual €3.33 a month" : "You've had your free walk. Passes from €9.99, or €3.33 a month on Annual.",
    cta: "Upgrade",
  };
}

/** Segments for small allowances (the free walk, three a day), a bar for anything bigger. */
function Meter({ remaining, total }: { remaining: number; total: number }) {
  if (total <= 10) {
    return (
      <div className="plan-card__meter" role="img" aria-label={`${remaining} of ${total} remaining`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} data-on={i < remaining} />
        ))}
      </div>
    );
  }
  return (
    <div className="plan-card__bar" role="img" aria-label={`${remaining} of ${total} remaining`}>
      <span style={{ width: `${(remaining / total) * 100}%` }} />
    </div>
  );
}

export default function PlanCard() {
  const { status, loading, refresh } = useWalkStatus();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nothing known yet (a first visit): hold the card's place rather than
  // making the page jump when it arrives. Remembered answers skip this.
  if (loading) {
    return (
      <section aria-hidden="true" className="plan-card">
        <div className="h-3 w-24 animate-pulse rounded-full bg-[color:var(--line)]" />
        <div className="h-8 w-32 animate-pulse rounded-full bg-[color:var(--line)]" />
        <div className="h-2 w-full animate-pulse rounded-full bg-[color:var(--line)]" />
        <div className="h-[52px] w-full animate-pulse rounded-2xl bg-[color:var(--line)]" />
      </section>
    );
  }
  if (!status.enabled) return null;

  const extra = (status.credits ?? 0) + (status.bonusCredits ?? 0);
  const plan = describe(status, extra);

  const manage = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't open your subscription.");
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open your subscription.");
      setBusy(false);
    }
  };

  return (
    <section className="plan-card" data-paid={plan.paid} aria-label="Subscription">
      <div className="plan-card__head">
        <div>
          <p className="plan-card__eyebrow">Subscription</p>
          <h2 className="plan-card__name">{plan.name}</h2>
        </div>
        {plan.badge ? <span className="plan-card__badge" data-tone={plan.badgeTone}>{plan.badge}</span> : null}
      </div>

      <div className="plan-card__usage">
        <div className="plan-card__usage-row">
          <p>
            <span className="plan-card__count">{plan.remaining}</span> {plan.remainingLabel}
          </p>
          {plan.total ? (
            <span className="plan-card__of">
              {plan.remaining} of {plan.total}
            </span>
          ) : null}
        </div>
        <Meter remaining={plan.remaining} total={plan.total ?? Math.max(plan.remaining, 1)} />
      </div>

      {plan.note ? <p className="plan-card__note">{plan.note}</p> : null}
      {plan.paid && extra > 0 ? (
        <p className="plan-card__note">
          + {extra} walk{extra === 1 ? "" : "s"} to use any time
        </p>
      ) : null}

      {status.annual ? (
        <button type="button" disabled={busy} onClick={() => void manage()} className="plan-card__cta plan-card__cta--quiet">
          {busy ? "Opening…" : "Manage subscription"}
        </button>
      ) : (
        <button type="button" onClick={() => setPaywallOpen(true)} className="plan-card__cta">
          {plan.cta}
        </button>
      )}
      {status.annual ? (
        <button type="button" onClick={() => setPaywallOpen(true)} className="plan-card__link">
          Need one more walk?
        </button>
      ) : null}
      {!status.signedIn ? <p className="plan-card__fine">Sign in to keep your walks on every device.</p> : null}
      {error ? <p className="plan-card__fine" style={{ color: "var(--danger)" }}>{error}</p> : null}

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
