"use client";

/**
 * A pretend checkout, for trying the buying flow without Stripe: add a card,
 * pay, get a receipt. Nothing is charged and nothing is granted — no request
 * leaves the browser. Shown by the paywall in place of Stripe's page when
 * NEXT_PUBLIC_MOCK_CHECKOUT=1, and on /dev/checkout.
 *
 * Four steps in one sheet: pay (the order and a saved card), add a card (with
 * a live picture of it and Stripe's test numbers a tap away), paying, done.
 * Card rules live in lib/billing/mockCard.ts.
 */

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/billing/products";
import {
  BRAND_NAME,
  TEST_CARDS,
  brandOf,
  charge,
  digits,
  formatExpiry,
  formatNumber,
  loadCards,
  storeCards,
  toSaved,
  validate,
  type CardErrors,
  type CardForm,
  type SavedCard,
} from "@/lib/billing/mockCard";

type Step = "pay" | "add" | "paying" | "done";

const EMPTY: CardForm = { number: "", expiry: "", cvc: "", name: "" };

function BrandMark({ brand }: { brand: SavedCard["brand"] }) {
  return (
    <span className="mock-co__brand" data-brand={brand}>
      {brand === "mastercard" ? (
        <svg viewBox="0 0 32 20" width="30" height="19" aria-hidden="true">
          <circle cx="12" cy="10" r="8" fill="#eb001b" />
          <circle cx="20" cy="10" r="8" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
      ) : (
        BRAND_NAME[brand]
      )}
    </span>
  );
}

export default function MockCheckout({
  product,
  onClose,
  onPaid,
}: {
  /** What is being bought. Mounted on opening, so each opening starts afresh. */
  product: Product;
  onClose: () => void;
  /** After the receipt's Done. */
  onPaid?: (product: Product) => void;
}) {
  // On the saved cards if there are any, otherwise straight to adding one.
  const [cards, setCards] = useState<SavedCard[]>(loadCards);
  const [selected, setSelected] = useState<string | null>(() => cards[0]?.id ?? null);
  const [step, setStep] = useState<Step>(() => (cards.length ? "pay" : "add"));
  const [form, setForm] = useState<CardForm>(EMPTY);
  const [errors, setErrors] = useState<CardErrors>({});
  const [save, setSave] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ reference: string; card: SavedCard; at: Date } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "add") numberRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Escape backs out one step, and closes from the first; never mid-payment.
  const stepRef = useRef(step);
  const cardsRef = useRef(cards);
  useEffect(() => {
    stepRef.current = step;
    cardsRef.current = cards;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Ahead of the paywall's own Escape, which would close everything.
      e.stopImmediatePropagation();
      if (stepRef.current === "paying") return;
      if (stepRef.current === "add" && cardsRef.current.length) setStep("pay");
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const pay = async (card: SavedCard) => {
    setError(null);
    setStep("paying");
    const result = await charge(card);
    if (!result.ok) {
      setError(result.message);
      setStep("pay");
      return;
    }
    setReceipt({ reference: result.reference, card, at: new Date() });
    setStep("done");
  };

  const addCard = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const card = toSaved(form);
    // An unsaved card is still used for this payment, just not kept.
    const next = [card, ...cards];
    if (save) storeCards(next);
    setCards(next);
    setSelected(card.id);
    setForm(EMPTY);
    void pay(card);
  };

  const remove = (id: string) => {
    const next = cards.filter((c) => c.id !== id);
    storeCards(next);
    setCards(next);
    if (selected === id) setSelected(next[0]?.id ?? null);
    if (!next.length) setStep("add");
  };

  const set = (key: keyof CardForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete") ?? false;
    const value =
      key === "number"
        ? formatNumber(v)
        : key === "expiry"
          ? formatExpiry(v, deleting)
          : key === "cvc"
            ? digits(v).slice(0, brandOf(form.number) === "amex" ? 4 : 3)
            : v;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const fillTest = (number: string) => {
    const now = new Date();
    const yy = String((now.getFullYear() + 3) % 100).padStart(2, "0");
    setForm((f) => ({ number, expiry: `12 / ${yy}`, cvc: "123", name: f.name || "Test Walker" }));
    setErrors({});
  };

  const chosen = cards.find((c) => c.id === selected) ?? null;
  const brand = brandOf(form.number);
  const previewNumber = form.number || "•••• •••• •••• ••••";
  const amount = product.mode === "subscription" ? product.card.small.replace(/ billed yearly/, "") : product.card.headline;

  return (
    <div
      className="mock-co"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "paying") onClose();
      }}
    >
      <div className="mock-co__sheet">
        <div className="mock-co__head">
          {step === "add" && cards.length ? (
            <button type="button" className="mock-co__icon" onClick={() => setStep("pay")} aria-label="Back">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          ) : (
            <span className="mock-co__test">TEST MODE</span>
          )}
          <h2>{step === "add" ? "Add a card" : step === "done" ? "Paid" : "Checkout"}</h2>
          <button type="button" className="mock-co__icon" onClick={onClose} disabled={step === "paying"} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {step === "done" && receipt ? (
          <div className="mock-co__done">
            <div className="mock-co__tick" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </div>
            <p className="mock-co__done-title">Thanks — you&apos;re all set</p>
            <p className="mock-co__muted">{product.detail}</p>
            <dl className="mock-co__receipt">
              <div>
                <dt>{product.name}</dt>
                <dd>{amount}</dd>
              </div>
              <div>
                <dt>Paid with</dt>
                <dd>
                  {BRAND_NAME[receipt.card.brand]} •••• {receipt.card.last4}
                </dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd className="mock-co__mono">{receipt.reference}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{receipt.at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
            </dl>
            <button type="button" className="paywall__cta mock-co__cta" onClick={() => onPaid?.(product)}>
              Done
            </button>
            <p className="mock-co__fine">A mock payment: no money moved and nothing was added to your account.</p>
          </div>
        ) : step === "add" ? (
          <form className="mock-co__form" onSubmit={addCard} noValidate>
            <div className="mock-co__card" data-brand={brand} data-flipped={flipped}>
              <div className="mock-co__card-face">
                <div className="mock-co__card-top">
                  <span className="mock-co__chip" aria-hidden="true" />
                  <BrandMark brand={brand} />
                </div>
                <p className="mock-co__card-number">{previewNumber}</p>
                <div className="mock-co__card-bottom">
                  <span>{form.name.trim().toUpperCase() || "NAME ON CARD"}</span>
                  <span>{form.expiry.replace(/ /g, "") || "MM/YY"}</span>
                </div>
              </div>
              <div className="mock-co__card-back" aria-hidden="true">
                <span className="mock-co__stripe" />
                <span className="mock-co__cvc">{form.cvc || "•••"}</span>
              </div>
            </div>

            <label className="mock-co__field">
              <span>Card number</span>
              <input
                ref={numberRef}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 1234 1234 1234"
                value={form.number}
                onChange={set("number")}
                aria-invalid={!!errors.number}
              />
              {errors.number ? <em>{errors.number}</em> : null}
            </label>
            <div className="mock-co__row">
              <label className="mock-co__field">
                <span>Expiry</span>
                <input
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM / YY"
                  value={form.expiry}
                  onChange={set("expiry")}
                  aria-invalid={!!errors.expiry}
                />
                {errors.expiry ? <em>{errors.expiry}</em> : null}
              </label>
              <label className="mock-co__field">
                <span>CVC</span>
                <input
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder={brand === "amex" ? "1234" : "123"}
                  value={form.cvc}
                  onChange={set("cvc")}
                  onFocus={() => setFlipped(true)}
                  onBlur={() => setFlipped(false)}
                  aria-invalid={!!errors.cvc}
                />
                {errors.cvc ? <em>{errors.cvc}</em> : null}
              </label>
            </div>
            <label className="mock-co__field">
              <span>Name on card</span>
              <input autoComplete="cc-name" placeholder="Jane Walker" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} />
              {errors.name ? <em>{errors.name}</em> : null}
            </label>
            <label className="mock-co__check">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
              <span>Save this card for next time</span>
            </label>

            <div className="mock-co__tests">
              <p>Test cards — any future date, any CVC</p>
              <div>
                {TEST_CARDS.map((t) => (
                  <button key={t.number} type="button" onClick={() => fillTest(t.number)} data-outcome={t.outcome}>
                    <span className="mock-co__mono">•••• {t.number.slice(-4)}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="paywall__cta mock-co__cta">
              Add card and pay {amount}
            </button>
          </form>
        ) : (
          <div className="mock-co__pay">
            <div className="mock-co__summary">
              <div>
                <p className="mock-co__item">{product.name}</p>
                <p className="mock-co__muted">{product.detail}</p>
              </div>
              <p className="mock-co__amount">{amount}</p>
            </div>
            <div className="mock-co__total">
              <span>Total due today</span>
              <span>{amount}</span>
            </div>

            <p className="mock-co__label">Pay with</p>
            <ul className="mock-co__cards" role="radiogroup" aria-label="Saved cards">
              {cards.map((c) => (
                <li key={c.id}>
                  <label className="mock-co__saved" data-on={c.id === selected}>
                    <input
                      type="radio"
                      name="mock-card"
                      checked={c.id === selected}
                      onChange={() => setSelected(c.id)}
                      disabled={step === "paying"}
                    />
                    <BrandMark brand={c.brand} />
                    <span className="mock-co__saved-text">
                      <span>•••• {c.last4}</span>
                      <small>Expires {c.expiry}</small>
                    </span>
                  </label>
                  <button type="button" className="mock-co__remove" onClick={() => remove(c.id)} disabled={step === "paying"} aria-label={`Remove card ending ${c.last4}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mock-co__add" onClick={() => setStep("add")} disabled={step === "paying"}>
              <span aria-hidden="true">+</span> Add a new card
            </button>

            {error ? (
              <p className="mock-co__error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="paywall__cta mock-co__cta"
              disabled={!chosen || step === "paying"}
              onClick={() => chosen && void pay(chosen)}
            >
              {step === "paying" ? (
                <>
                  <span className="mock-co__spinner" aria-hidden="true" /> Paying…
                </>
              ) : (
                `Pay ${amount}`
              )}
            </button>
            <p className="mock-co__fine">
              {product.mode === "subscription" ? "Renews yearly until cancelled. " : "One payment — doesn't renew. "}
              This is a mock checkout: no card is charged.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
