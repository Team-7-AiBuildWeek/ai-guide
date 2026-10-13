import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms — WalkDots",
  description: "What you buy when you buy walks on WalkDots, how walks are counted, renewals, refunds and points.",
};

/**
 * The terms of sale, written from what the code does (lib/billing): how a walk
 * is counted, what each product grants, fair use, renewals, refunds and the
 * points rules. If any of that changes in the code, this page changes with it.
 */

const UPDATED = "13 October 2026";
const CONTACT = "jurajkolesar1976@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-h3)]">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-6 pb-16">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn btn--quiet shrink-0 px-4" aria-label="Back to the map">
          ←
        </Link>
        <h1 className="text-[length:var(--text-h2)]">Terms</h1>
      </header>

      <div className="flex flex-col gap-3">
        <p className="u-eyebrow">Last updated {UPDATED}</p>
        <p>
          WalkDots builds audio walking tours on the website and in the iPhone app. Your first walk is
          free. After that you can buy walks, a pass or a yearly plan. These terms say what you get.
          Payments are handled by Stripe; WalkDots never sees your card.
        </p>
      </div>

      <Section title="Who sells">
        <p>
          WalkDots is sold by Juraj Kolesár. Questions, problems and refund requests:{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="What counts as a walk">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>A walk is one new tour built for you — the moment WalkDots chooses your stops.</li>
          <li>Walking one of your tours again, in any language, is free and never uses a walk.</li>
          <li>If building a tour fails, the walk is given back automatically.</li>
          <li>Buying needs an account, so what you buy works on the website and in the app.</li>
        </ul>
      </Section>

      <Section title="What you can buy">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-[color:var(--ink)]">One walk — €4.99.</strong> One walk to use
            whenever you like. It does not expire.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">City Pass — €9.99.</strong> 72 hours from
            purchase, up to 3 walks a day. A one-time payment; it does not renew.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Trip Pass — €14.99.</strong> 7 days from
            purchase, up to 3 walks a day. A one-time payment; it does not renew.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Annual — €39.99 a year.</strong> Up to 10
            walks each calendar month. It renews every year until you cancel.
          </li>
        </ul>
        <p>
          Prices include VAT. Days and months are counted in UTC. Buying a second pass while one is
          running adds its time on to the end of the first. Walks are used in this order: your free
          walk, then a pass, then the yearly plan, then walks you bought, then walks earned with
          points.
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Passes and the yearly plan are for your own walks. The daily and monthly limits above keep
          them affordable; WalkDots may also limit very heavy or automated use, and may stop an
          account that is shared or resold.
        </p>
      </Section>

      <Section title="Renewal and cancelling">
        <p>
          The yearly plan renews automatically at the price shown when you bought it, unless you
          cancel before the renewal date. Cancel any time from Account → Manage plan; it then runs to
          the end of the year you paid for. You can see your receipts there too.
        </p>
      </Section>

      <Section title="Refunds and your right to withdraw">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            Walks are digital content you get straight away. When you pay you agree that a pass or the
            yearly plan starts at once, which means the 14-day right to withdraw ends once it has
            started (EU consumer law).
          </li>
          <li>A single walk you have not used can be refunded within 14 days of buying it — just ask.</li>
          <li>
            If a walk did not work because of a fault on our side, write to us and we will put it
            right or refund it.
          </li>
          <li>Refunded or charged-back purchases take back what they granted.</li>
        </ul>
      </Section>

      <Section title="Points">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            Signed in, you earn 50 points for each paid walk you complete (reaching most of its
            stops), and 100 extra for your first completed walk in a new city.
          </li>
          <li>When a friend you invited makes their first purchase, you both get 500 points.</li>
          <li>500 points buys one walk. Points have no cash value and cannot be sold or transferred.</li>
          <li>The free walk, and walks paid for with points or a promotion, do not earn points.</li>
          <li>Points expire after 12 months without any activity, and go when an account is deleted.</li>
          <li>Points earned by mistake or by misuse can be removed.</li>
        </ul>
      </Section>

      <Section title="Deleting your account">
        <p>
          Deleting your account (Account → Delete account) cancels the yearly plan immediately and
          removes any walks, pass time and points left on it. There is no refund for time or walks
          left, except unused single walks bought in the last 14 days.
        </p>
      </Section>

      <Section title="Changes and the law">
        <p>
          If these terms change, the new version applies to purchases made after it is published;
          the date at the top says when it last did. Nothing here takes away the rights consumer law
          in your country gives you. How your information is handled is in the{" "}
          <Link href="/privacy" className="font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}
