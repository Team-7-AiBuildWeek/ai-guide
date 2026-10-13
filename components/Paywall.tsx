"use client";

/**
 * The paywall: shown instead of building a walk when there is no walk left to
 * build with.
 *
 * Says why first, in one line, because "pay" with no reason reads as a trick.
 * Buying needs an account (purchases have to follow the person to their phone),
 * so a signed-out walker signs in here first — and signing in may be all it
 * takes, when the paywall only asked for an account (the free walk behind a
 * shared address).
 *
 * The products come from lib/billing/products.ts; checkout is Stripe's own
 * page (app/api/billing/checkout), so no card ever touches WalkDots.
 */

import Link from "next/link";
import { useState } from "react";
import OverlaySheet from "./OverlaySheet";
import SignInSheet from "./SignInSheet";
import { PRODUCTS, type ProductId } from "@/lib/billing/products";
import type { ClientWalkStatus } from "@/lib/billing/useWalkStatus";
import type { PaywallReason } from "@/lib/billing/store";

const WHY: Record<PaywallReason, { title: string; body: string }> = {
  signin_for_free: {
    title: "Sign in for your free walk",
    body: "A few free walks have already been taken from this connection today. Sign in and your first walk is free.",
  },
  signin: {
    title: "You've had your free walk",
    body: "Hope you enjoyed it. Sign in to get more walks — they follow you to your phone.",
  },
  no_walks: {
    title: "Ready for another walk?",
    body: "Pick what suits your trip. Every walk is built just for you.",
  },
  fair_use_pass: {
    title: "That's today's walks on your pass",
    body: "Your pass includes three walks a day, and more tomorrow. Need one now? A single walk adds one.",
  },
  fair_use_annual: {
    title: "That's this month's walks",
    body: "Your plan includes ten walks a month. A single walk adds one more.",
  },
};

export default function Paywall({
  open,
  reason,
  status,
  onClose,
  onStatus,
}: {
  open: boolean;
  reason: PaywallReason | null;
  status: ClientWalkStatus;
  onClose: () => void;
  /** After signing in: the fresh status, so the caller can carry on if a walk is now available. */
  onStatus: () => void;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const why = WHY[reason ?? "no_walks"];
  // During a pass or a plan, only a single walk adds anything.
  const offers =
    reason === "fair_use_pass" || reason === "fair_use_annual" ? PRODUCTS.filter((p) => p.id === "single") : PRODUCTS;

  const buy = async (product: ProductId) => {
    setBusy(product);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Checkout isn't available right now.");
      // Stripe's page; it comes back to /billing/done.
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout isn't available right now.");
      setBusy(null);
    }
  };

  const close = () => {
    setSigningIn(false);
    setError(null);
    onClose();
  };

  return (
    <OverlaySheet open={open} onClose={close} label="Get more walks">
      {signingIn ? (
        <SignInSheet
          onDone={() => {
            setSigningIn(false);
            onStatus();
          }}
          onClose={() => setSigningIn(false)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[length:var(--text-h3)]">{why.title}</h2>
            <p className="mt-1 text-[color:var(--ink-soft)]">{why.body}</p>
          </div>

          {!status.signedIn ? (
            <button type="button" onClick={() => setSigningIn(true)} className="btn btn--primary btn--lg w-full">
              Sign in to continue
            </button>
          ) : (
            <ul className="flex flex-col gap-2">
              {offers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void buy(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 py-3 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                        {p.name}
                      </span>
                      <span className="block text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{p.detail}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                        {busy === p.id ? "Opening…" : p.price}
                      </span>
                      <span className="block text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{p.perWalk}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="text-[length:var(--text-caption)] text-[color:var(--danger)]">{error}</p> : null}

          <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {status.signedIn ? "Prices include VAT. Paid securely with Stripe. " : ""}
            Walking one of your tours again is always free.{" "}
            <Link href="/terms" className="underline underline-offset-4">
              Terms
            </Link>
          </p>
          <button type="button" onClick={close} className="btn btn--quiet w-full">
            Not now
          </button>
        </div>
      )}
    </OverlaySheet>
  );
}
