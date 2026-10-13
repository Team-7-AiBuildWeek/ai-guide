"use client";

/**
 * Back from Stripe. Confirms the payment straight away (app/api/billing/confirm)
 * rather than waiting for Stripe's webhook, which can lag the redirect by a few
 * seconds — a walker who has just paid should never see "no walks left".
 */

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { productById } from "@/lib/billing/products";

type State = { kind: "checking" } | { kind: "paid"; product: string | null } | { kind: "pending" } | { kind: "error"; message: string };

function Done() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    void (async () => {
      // A few tries: a card that needs a second's more processing is "not yet", not "no".
      for (let attempt = 0; attempt < 4 && live; attempt++) {
        try {
          const res = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          });
          const body = (await res.json().catch(() => ({}))) as { paid?: boolean; product?: string | null; error?: string };
          if (res.ok && body.paid) {
            if (live) setState({ kind: "paid", product: body.product ?? null });
            return;
          }
          if (!res.ok && attempt === 3) throw new Error(body.error ?? "We couldn't confirm that payment yet.");
        } catch (err) {
          if (attempt === 3 && live) setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (live) setState((s) => (s.kind === "checking" ? { kind: "pending" } : s));
    })();
    return () => {
      live = false;
    };
  }, [sessionId]);

  const name = state.kind === "paid" && state.product ? productById(state.product)?.name : null;
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      {!sessionId ? (
        <>
          <h1 className="text-[length:var(--text-h2)]">Nothing to confirm</h1>
          <p>This page is where Stripe sends you back after paying.</p>
        </>
      ) : state.kind === "checking" ? (
        <>
          <h1 className="text-[length:var(--text-h2)]">Confirming your payment…</h1>
          <p className="text-[color:var(--ink-soft)]">One moment.</p>
        </>
      ) : state.kind === "paid" ? (
        <>
          <h1 className="text-[length:var(--text-h2)]">You&apos;re all set</h1>
          <p>{name ? `${name} is on your account.` : "Your walks are on your account."} They&apos;re on your phone too when you sign in there.</p>
        </>
      ) : state.kind === "pending" ? (
        <>
          <h1 className="text-[length:var(--text-h2)]">Payment received</h1>
          <p>It&apos;s still being processed. Your walks will appear within a minute — you&apos;ll get an email receipt from Stripe.</p>
        </>
      ) : (
        <>
          <h1 className="text-[length:var(--text-h2)]">We couldn&apos;t confirm it yet</h1>
          <p>{state.message} If you were charged, your walks will appear shortly; nothing is lost.</p>
        </>
      )}
      {sessionId && state.kind !== "checking" ? (
        <Link href="/" className="btn btn--primary btn--lg w-full">
          Build my walk
        </Link>
      ) : null}
    </main>
  );
}

export default function BillingDonePage() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  );
}
