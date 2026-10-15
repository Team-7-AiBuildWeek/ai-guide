/**
 * The mock checkout's cards (components/MockCheckout.tsx): formatting,
 * checking and "charging" a card that never leaves the browser.
 *
 * The test numbers are Stripe's own, so the same habits work in both: 4242…
 * pays, 0002 is declined, 9995 has no money. Any other number that passes the
 * Luhn check pays too — it is a mock.
 *
 * Saved cards keep only what a real wallet shows (brand, last four, expiry,
 * name), never the full number, and live in this browser's localStorage.
 *
 * Safe to import in the browser.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export type SavedCard = {
  id: string;
  brand: CardBrand;
  last4: string;
  /** MM/YY */
  expiry: string;
  name: string;
  /** What paying with it does, decided when it was added. */
  outcome: Outcome;
};

export type Outcome = "ok" | "declined" | "insufficient";

export const TEST_CARDS: { number: string; label: string; outcome: Outcome }[] = [
  { number: "4242 4242 4242 4242", label: "Pays", outcome: "ok" },
  { number: "5555 5555 5555 4444", label: "Pays (Mastercard)", outcome: "ok" },
  { number: "4000 0000 0000 0002", label: "Declined", outcome: "declined" },
  { number: "4000 0000 0000 9995", label: "No funds", outcome: "insufficient" },
];

export const DECLINE_MESSAGE: Record<Exclude<Outcome, "ok">, string> = {
  declined: "Your card was declined. Try another card.",
  insufficient: "Your card has insufficient funds. Try another card.",
};

export const digits = (s: string) => s.replace(/\D/g, "");

export function brandOf(number: string): CardBrand {
  const d = digits(number);
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^6(011|5)/.test(d)) return "discover";
  return "unknown";
}

export const BRAND_NAME: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  unknown: "Card",
};

/** 4-4-4-4, or 4-6-5 for Amex; at most 16 (15) digits. */
export function formatNumber(raw: string): string {
  const amex = brandOf(raw) === "amex";
  const d = digits(raw).slice(0, amex ? 15 : 16);
  if (amex) return [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(" ");
  return d.replace(/(.{4})/g, "$1 ").trim();
}

/** "1" → "1", "12" → "12 / ", "1228" → "12 / 28". A first digit above 1 is a month on its own. */
export function formatExpiry(raw: string, deleting: boolean): string {
  let d = digits(raw).slice(0, 4);
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  if (d.length < 2) return d;
  if (d.length === 2) return deleting ? d : `${d} / `;
  return `${d.slice(0, 2)} / ${d.slice(2)}`;
}

export function luhn(number: string): boolean {
  const d = digits(number);
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return d.length > 0 && sum % 10 === 0;
}

export type CardForm = { number: string; expiry: string; cvc: string; name: string };
export type CardErrors = Partial<Record<keyof CardForm, string>>;

export function validate(form: CardForm, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  const n = digits(form.number);
  const amex = brandOf(n) === "amex";
  if (n.length !== (amex ? 15 : 16)) errors.number = "Your card number is incomplete.";
  else if (!luhn(n)) errors.number = "Your card number is invalid.";

  const e = digits(form.expiry);
  const month = Number(e.slice(0, 2));
  const year = 2000 + Number(e.slice(2, 4));
  if (e.length !== 4) errors.expiry = "Your card's expiry date is incomplete.";
  else if (month < 1 || month > 12) errors.expiry = "Your card's expiry month is invalid.";
  else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
    errors.expiry = "Your card has expired.";

  if (digits(form.cvc).length !== (amex ? 4 : 3)) errors.cvc = "Your card's security code is incomplete.";
  if (!form.name.trim()) errors.name = "Enter the name on the card.";
  return errors;
}

export function toSaved(form: CardForm): SavedCard {
  const n = digits(form.number);
  const test = TEST_CARDS.find((t) => digits(t.number) === n);
  const e = digits(form.expiry);
  return {
    id: crypto.randomUUID(),
    brand: brandOf(n),
    last4: n.slice(-4),
    expiry: `${e.slice(0, 2)}/${e.slice(2, 4)}`,
    name: form.name.trim(),
    outcome: test?.outcome ?? "ok",
  };
}

const KEY = "walkdots.mockCards";

export function loadCards(): SavedCard[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SavedCard[]) : [];
  } catch {
    return [];
  }
}

export function storeCards(cards: SavedCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    // Private window or storage blocked: the cards last as long as the page.
  }
}

/** A charge that takes about as long as a real one. */
export async function charge(card: SavedCard): Promise<{ ok: true; reference: string } | { ok: false; message: string }> {
  await new Promise((r) => setTimeout(r, 1400 + Math.random() * 600));
  if (card.outcome !== "ok") return { ok: false, message: DECLINE_MESSAGE[card.outcome] };
  const reference = `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return { ok: true, reference };
}

/** Is the mock checkout standing in for Stripe here? */
export const mockCheckoutOn = () => process.env.NEXT_PUBLIC_MOCK_CHECKOUT === "1";
