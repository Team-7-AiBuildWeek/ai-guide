"use client";

/**
 * The paywall: a full-screen page instead of building a walk when there is no
 * walk left to build with.
 *
 * Laid out like the best travel-app paywalls (Flighty's was the reference): a
 * dark hero that shows the product rather than describing it — a walk in
 * progress, route and voice — then one large card per plan, swiped sideways,
 * each with who it is for, the price as you would think of it, one button and
 * two lines on what you get. The next card peeks in so it is obvious there is
 * more than one.
 *
 * What it does not borrow: badges WalkDots has not earned. No "most popular",
 * no awards; savings say "up to" because they assume every walk is used
 * (lib/billing/products.ts).
 *
 * Buying needs an account (purchases follow the person to their phone). The
 * plans show signed out too; choosing one asks for sign-in and then carries on
 * to checkout with the plan that was chosen. Checkout itself is Stripe's page
 * (app/api/billing/checkout), so no card ever touches WalkDots.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import RouteArt from "./RouteArt";
import SignInSheet from "./SignInSheet";
import { PRODUCTS, type Product, type ProductId } from "@/lib/billing/products";
import type { ClientWalkStatus } from "@/lib/billing/useWalkStatus";
import type { PaywallReason } from "@/lib/billing/store";

const WHY: Record<PaywallReason, { title: string; body: string }> = {
  signin_for_free: {
    title: "Your first walk is on us",
    body: "A few free walks were already taken from this connection today. Sign in and yours is free.",
  },
  signin: {
    title: "Keep walking",
    body: "You've had your free walk. Pick what suits your trip — every walk is built just for you.",
  },
  no_walks: {
    title: "Keep walking",
    body: "Pick what suits your trip — every walk is built just for you.",
  },
  fair_use_pass: {
    title: "That's today's walks",
    body: "Your pass includes three walks a day, with more tomorrow. Need one now?",
  },
  fair_use_annual: {
    title: "That's this month's walks",
    body: "Your plan includes ten walks a month. One more is a tap away.",
  },
};

/** Shown in the order a traveller thinks: a few days, a week, a year, just one. */
const ORDER: ProductId[] = ["city72h", "trip7d", "annual", "single"];

function Icon({ name }: { name: Product["card"]["features"][number]["icon"] }) {
  const paths: Record<typeof name, React.ReactNode> = {
    infinity: <path d="M7 9a3 3 0 1 0 0 6c3 0 7-6 10-6a3 3 0 1 1 0 6c-3 0-7-6-10-6Z" />,
    calendar: (
      <>
        <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </>
    ),
    renew: (
      <>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" />
        <path d="M20 4v4.5h-4.5" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    sparkle: <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />,
    pin: (
      <>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
        <circle cx="12" cy="10" r="2.3" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

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
  /** Chosen before signing in, so checkout carries on with it afterwards. */
  const [pending, setPending] = useState<ProductId | null>(null);
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const why = WHY[reason ?? "no_walks"];
  const freeBehindSignIn = reason === "signin_for_free";
  // During a pass or a plan, only a single walk adds anything.
  const offers = (
    reason === "fair_use_pass" || reason === "fair_use_annual" ? (["single"] as ProductId[]) : ORDER
  ).map((id) => PRODUCTS.find((p) => p.id === id)!);

  const close = () => {
    setSigningIn(false);
    setPending(null);
    setError(null);
    onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // The page behind does not scroll while this is up; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const checkout = async (product: ProductId) => {
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

  const choose = (product: ProductId) => {
    if (!status.signedIn) {
      setPending(product);
      setSigningIn(true);
      return;
    }
    void checkout(product);
  };

  const onRailScroll = () => {
    const el = rail.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 12 : el.clientWidth;
    setIndex(Math.max(0, Math.min(offers.length - 1, Math.round(el.scrollLeft / step))));
  };

  const goTo = (i: number) => {
    const el = rail.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 16, behavior: "smooth" });
  };

  return (
    <div className="paywall" data-open={open} role="dialog" aria-modal="true" aria-label="Get more walks" aria-hidden={!open} inert={!open}>
      <div className="paywall__scroll">
        <header className="paywall__hero">
          <div className="paywall__top">
            <span className="paywall__brand">
              WalkDots <b>WALKS</b>
            </span>
            <button type="button" onClick={close} className="paywall__close" aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <RouteArt player />
          <div className="paywall__why">
            <h2>{why.title}</h2>
            <p>{why.body}</p>
          </div>
        </header>

        {signingIn ? (
          <div className="paywall__card paywall__card--single">
            <SignInSheet
              onDone={() => {
                setSigningIn(false);
                onStatus();
                // Carry on with the plan chosen before signing in.
                if (pending) {
                  const p = pending;
                  setPending(null);
                  void checkout(p);
                }
              }}
              onClose={() => {
                setSigningIn(false);
                setPending(null);
              }}
            />
          </div>
        ) : freeBehindSignIn ? (
          <div className="paywall__card paywall__card--single">
            <span className="paywall__badge">FREE</span>
            <h3 className="paywall__title">Your first walk</h3>
            <p className="paywall__tagline">A full walk built around what you want to see — free when you sign in.</p>
            <button type="button" onClick={() => setSigningIn(true)} className="paywall__cta">
              Sign in — it&apos;s free
            </button>
          </div>
        ) : (
          <>
            <div ref={rail} className="paywall__rail" onScroll={onRailScroll}>
              {offers.map((p) => (
                <article key={p.id} className="paywall__card">
                  <span className="paywall__badge">{p.card.badge}</span>
                  <h3 className="paywall__title">{p.name}</h3>
                  <p className="paywall__tagline">{p.card.tagline}</p>
                  <div className="paywall__price">
                    <div>
                      <p>
                        <span className="paywall__amount">{p.card.headline}</span> <span className="paywall__per">{p.card.per}</span>
                      </p>
                      <p className="paywall__small">{p.card.small}</p>
                    </div>
                    {p.card.saving ? <span className="paywall__saving">{p.card.saving}</span> : null}
                  </div>
                  <button type="button" disabled={busy !== null} onClick={() => choose(p.id)} className="paywall__cta">
                    {busy === p.id ? "Opening checkout…" : "Continue"}
                  </button>
                  <ul className="paywall__features">
                    {p.card.features.map((f) => (
                      <li key={f.text}>
                        <Icon name={f.icon} />
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            {offers.length > 1 ? (
              <div className="paywall__dots" role="tablist" aria-label="Plans">
                {offers.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={p.name}
                    onClick={() => goTo(i)}
                    data-on={i === index}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}

        <footer className="paywall__foot">
          {error ? <p className="paywall__error">{error}</p> : null}
          <p>
            Walking one of your tours again is always free. Prices include VAT; paid securely with Stripe.{" "}
            <Link href="/terms" className="underline underline-offset-4">
              Terms
            </Link>
          </p>
          <button type="button" onClick={close} className="paywall__later">
            Not now
          </button>
        </footer>
      </div>
    </div>
  );
}
