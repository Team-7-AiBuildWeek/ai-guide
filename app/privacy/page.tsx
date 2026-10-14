import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — WalkDots",
  description: "What WalkDots does with your location and your words, who it shares them with, and your rights.",
};

/**
 * The privacy policy, for the website and the iPhone app alike.
 *
 * Written from what the code does, not from a template: if a route starts
 * sending something new to a provider, or the backend starts keeping
 * something new, this page has to change with it. The date at the top says
 * when it last did.
 */

const UPDATED = "14 October 2026";
const CONTACT = "jurajkolesar1976@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-h3)]">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-6 pb-16">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn btn--quiet shrink-0 px-4" aria-label="Back to the map">
          ←
        </Link>
        <h1 className="text-[length:var(--text-h2)]">Privacy</h1>
      </header>

      <div className="flex flex-col gap-3">
        <p className="u-eyebrow">Last updated {UPDATED}</p>
        <p>
          WalkDots builds audio walking tours on the website and in the iPhone app. This page says what
          it does with your information. The short version: no tracking and no advertising, and an
          account is optional — you need one only to buy walks or collect points. To build a tour, your starting point and what you asked for are sent
          to the services that write and voice it. Your walks are kept on your own device, and, if
          you sign in, with your account so your other devices have them too.
        </p>
      </div>

      <Section title="Who runs WalkDots">
        <p>
          WalkDots is run by Juraj Kolesár, who is responsible for your data under the EU General Data
          Protection Regulation (GDPR). For anything on this page, write to{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="What WalkDots uses, and why">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-[color:var(--ink)]">Your location.</strong> To show where you are,
            find which city you are in, start the tour near you, give directions and start each
            stop&apos;s story when you arrive. The app asks only for location while it is in use, not
            in the background.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Your approximate city, if location is off.</strong>{" "}
            To offer a sample walk of a city you know, WalkDots reads the city your internet
            connection appears to be in (from our hosting provider, Vercel, which works it out from
            your internet address) and suggests that city or the nearest bigger one. It is used for
            that suggestion only and not stored.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">What you ask for.</strong> The settings you
            choose (length, detail, pace, interests, language), anything you type in your own words,
            the start and end points you pick, and the places you search for.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Your email address, if you sign in.</strong>{" "}
            Signing in is optional — it is needed only to buy walks or collect points — and uses a
            one-time code sent to your email; there is no password. When you sign up you can also tell WalkDots what to call you and what you like to
            see (interests and how much detail); both are optional. With an account, these and your
            past walks are kept with it so the website and the iPhone app start from the same place.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Questions you ask during a walk.</strong>{" "}
            Sent with the stop you are at and your current position, so the answer is about what is in
            front of you.
          </li>
        </ul>
        <p>
          The legal basis is that you asked for this: WalkDots cannot build or guide a tour without it
          (GDPR Article 6(1)(b)). The same goes for walks you buy: WalkDots needs to know what you
          bought to give it to you. Records of sales are kept because accounting law requires it
          (Article 6(1)(c)). WalkDots does not use your information for anything else, does not sell
          it, and does not build a profile of you.
        </p>
      </Section>

      <Section title="Who it is shared with">
        <p>WalkDots uses these services to do the work. Each receives only what it needs for its part:</p>
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-[color:var(--ink)]">Google (Gemini).</strong> Writes the tour and
            the stories, answers your questions, and voices the narration. It receives your request,
            including anything you typed, your start and end points, and, for a question, the question
            and your position.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Clerk.</strong> Runs sign-in if you create an
            account: it holds your email address (and, if you gave them, your name and preferences), sends the sign-in codes, and keeps you signed in.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Stripe.</strong> Takes payment if you buy
            walks. On Stripe&apos;s own checkout page you give it your card or wallet, email address and
            country; it uses them to take the payment, prevent fraud and work out VAT, under its own
            privacy policy. WalkDots receives only a customer number, what you bought, the amount
            and whether it was paid or refunded — never your card details.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Stadia Maps.</strong> Map tiles on the
            website, place and city search, finding the city you are in, and walking routes. It
            receives what you search for, coordinates of your start point or current position, and the
            tour&apos;s stops.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">OpenStreetMap (Overpass).</strong> Finds trams
            and buses along the route, and the named places around you when you ask a question. It
            receives the route&apos;s points and, for a question, your position — sent from our server,
            so not who you are.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Wikipedia and Wikimedia.</strong> Photos of
            the stops, and the landmarks around you when you ask a question. For a photo it receives
            the stop&apos;s name and position; for a question, your position, sent from our server so
            not who you are. The photo itself is loaded straight from Wikimedia, which sees your
            device&apos;s internet address.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">GeoNames.</strong> A list of cities and their
            populations, used to suggest the nearest bigger city for a sample walk. It is kept on our
            servers, so nothing about you is sent to GeoNames. City data © GeoNames
            (geonames.org), used under the{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="underline underline-offset-4">
              Creative Commons Attribution 4.0
            </a>{" "}
            licence.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Apple.</strong> In the iPhone app, the map is
            Apple Maps, and if the city cannot be found otherwise, Apple&apos;s own location service
            names it. Apple handles this under its own privacy policy.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Hosting.</strong> The website and its servers
            run on Vercel; the walks kept with accounts, the tours WalkDots keeps and the data for prepared
            tours are in a Neon database, and narration in Cloudflare R2 storage.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Visit counts.</strong> The website counts its
            page views with Vercel Web Analytics: which page was opened, the referring site, and the
            country, browser and kind of device. It sets no cookies and keeps nothing that identifies
            you — telling one visit from another uses a value that is discarded every day. Vercel
            Speed Insights also measures how quickly each page loads on your device, with the same
            page, country, browser and kind of device and nothing more. The iPhone app does not count
            anything.
          </li>
        </ul>
        <p>
          Some of these providers are based in the United States, so your data may be processed
          there. They do this under their own terms and the safeguards the GDPR requires for such
          transfers, such as the EU–US Data Privacy Framework or standard contractual clauses.
        </p>
      </Section>

      <Section title="What is kept, and for how long">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-[color:var(--ink)]">On your device.</strong> Your current tour,
            your settings and your last 30 walks (including what you asked for and where they
            started), and in the app the narration already played, so it replays without signal.
            They stay until you delete them: one by one on the profile page, or all at once by
            clearing the website&apos;s data in your browser or deleting the app.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Usage counts, to stop abuse.</strong> Building a
            tour, writing and voicing its stops and answering questions cost money for every request,
            so each is counted against a limit per person. If you are signed in, that is your account;
            if not, the first time you use one of these, the website gives your browser a random ID in a
            cookie that is only sent with those requests and only used for this. There is also a looser
            limit per internet address. The counts are kept under scrambled, one-way codes — your
            account, the ID and your address themselves are never stored with them — and each count is
            deleted shortly after its hour or day is over. The cookie lasts a year, or until you clear
            the website&apos;s data. This is WalkDots&apos; legitimate interest in keeping the service
            running and paid for (GDPR Article 6(1)(f)).
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">With your account.</strong> If you sign in,
            your last 30 walks (the same record your device keeps, including what you asked for and
            where each started) are kept with your account, and Clerk keeps your email address. They
            stay until you delete them: a walk deleted on the profile page is deleted from your
            account too, and &ldquo;Delete account&rdquo; on the profile page deletes the account and
            everything kept with it, on the website and in the app.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Your walks, purchases and points.</strong>{" "}
            To give everyone one free walk and no more, WalkDots keeps a mark that the free walk has
            been used, under one-way codes made from your browser&apos;s random ID, your account (if
            signed in) and your internet address. This mark stays even if you delete your account, so
            a new account is not a second free walk (legitimate interest, Article 6(1)(f)). For each
            new tour WalkDots notes when it was built, what it was paid with, its stops&apos; positions
            and the city, linked to your account if you are signed in. If you buy walks, the purchase
            (what, when, how much, and its Stripe reference) and what you have left are kept with your
            account. If you collect points, WalkDots records your balance, which walks you completed
            and in which cities; when you finish a walk your arrival positions are checked against the
            stops and then discarded, not stored. Deleting your account cancels any plan and deletes
            what is left on it and your points; records of sales are kept for ten years for the
            accounts, under a one-way code instead of your account.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Every tour, on WalkDots&apos;s servers.</strong>{" "}
            Each tour is kept when it is built — what you asked for (including anything typed in your
            own words), the starting point, the stops and the route — together with the stories
            written for its stops and the recorded narration, so the same stop is never made twice
            and a tour can be played again. It is not linked to your account or to who you are. A kept
            tour may be shown to other people as the demo tour in the app, without the words you
            typed or the name of your starting point. Kept until it is no longer useful for this; to
            have a tour removed, write to the address above.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">For prepared tours.</strong> When a tour is
            built from settings alone (nothing typed in your own words) in a city where WalkDots keeps
            prepared tours, the database records the city, the settings and the starting point
            rounded to about 100 metres, with no way to tell who asked. This shows which tours to
            prepare in advance and is kept until it is no longer useful for that.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Server logs.</strong> Like any website, the
            hosting keeps short-lived technical logs of requests, which can include your internet
            address and, for searches, what was searched for. WalkDots does not use them except to fix
            faults.
          </li>
        </ul>
      </Section>

      <Section title="What WalkDots does not do">
        <p>
          No advertising, no tracking across sites, and no analytics beyond the anonymous visit
          counts and page speed above. No selling or renting of your data. The only cookies are the
          ones that keep you signed in, once you sign in, and the random ID behind the usage limits
          and the free walk above — plus, if you buy walks, Stripe&apos;s own on its checkout page.
          Fonts are
          part of the site and the app, not fetched from a third party.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you can ask to see the data WalkDots holds about you, have it corrected or
          deleted, restrict or object to its use, and receive it in a portable form. Most of it is
          on your own device, where you can delete it yourself, and an account can be deleted from
          the profile page at any time. For anything else, write to{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            {CONTACT}
          </a>
          . You can also complain to a data protection authority; in Slovakia that is the Úrad na
          ochranu osobných údajov Slovenskej republiky (dataprotection.gov.sk).
        </p>
      </Section>

      <Section title="Children">
        <p>
          WalkDots is not aimed at children under 16 and does not knowingly collect their information.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If WalkDots starts handling your information differently, this page will change first, and
          the date at the top will say when.
        </p>
      </Section>
    </main>
  );
}
