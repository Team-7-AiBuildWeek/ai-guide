"use client";

/**
 * The mock checkout on its own (components/MockCheckout.tsx): pick a plan,
 * add a card, pay. Open to anyone — it charges nothing and grants nothing,
 * and no request leaves the browser.
 */

import Link from "next/link";
import { useState } from "react";
import MockCheckout from "@/components/MockCheckout";
import { PRODUCTS, type Product } from "@/lib/billing/products";
import { TEST_CARDS } from "@/lib/billing/mockCard";

export default function MockCheckoutPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [paid, setPaid] = useState<string[]>([]);

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-[max(1.5rem,var(--safe-top))]">
      <Link href="/" className="text-[length:var(--text-caption)] text-ink-mute underline underline-offset-4">
        ← WalkDots
      </Link>
      <h1 className="mt-4 text-[length:var(--text-h2)]">Mock checkout</h1>
      <p className="mt-2">
        Pick a plan, add a card and pay. Nothing is charged and nothing is added to an account. Set{" "}
        <code>NEXT_PUBLIC_MOCK_CHECKOUT=1</code> to get the same sheet from the paywall instead of Stripe.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {PRODUCTS.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 rounded-[20px] border border-line bg-surface p-4">
            <div>
              <p className="font-[family-name:var(--font-display)] font-semibold text-ink">{p.name}</p>
              <p className="text-[length:var(--text-caption)] text-ink-mute">{p.price}</p>
            </div>
            <button type="button" onClick={() => setProduct(p)} className="paywall__cta !mt-0 !min-h-11 px-5 !text-base">
              Buy
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[length:var(--text-lead)]">Test cards</h2>
      <ul className="mt-2 text-[length:var(--text-caption)]">
        {TEST_CARDS.map((t) => (
          <li key={t.number}>
            <code>{t.number}</code> — {t.label}
          </li>
        ))}
        <li>Any other valid number pays. Saved cards keep only the last four digits, in this browser.</li>
      </ul>

      {paid.length ? (
        <p className="mt-6 rounded-[14px] bg-mint-wash p-3 text-mint-ink" role="status">
          Paid (mock) this visit: {paid.join(", ")}
        </p>
      ) : null}

      {product ? (
        <MockCheckout
          key={product.id}
          product={product}
          onClose={() => setProduct(null)}
          onPaid={(p) => {
            setPaid((x) => [...x, p.name]);
            setProduct(null);
          }}
        />
      ) : null}
    </main>
  );
}
