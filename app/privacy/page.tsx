import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Walk",
  description: "What Walk does with your location and your words, who it shares them with, and your rights.",
};

/**
 * The privacy policy, for the website and the iPhone app alike.
 *
 * Written from what the code does, not from a template: if a route starts
 * sending something new to a provider, or the backend starts keeping
 * something new, this page has to change with it. The date at the top says
 * when it last did.
 */

const UPDATED = "6 October 2026";
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
          Walk builds audio walking tours on the website and in the iPhone app. This page says what
          it does with your information. The short version: no tracking and no advertising, and an
          account is optional. To build a tour, your starting point and what you asked for are sent
          to the services that write and voice it. Your walks are kept on your own device, and, if
          you sign in, with your account so your other devices have them too.
        </p>
      </div>

      <Section title="Who runs Walk">
        <p>
          Walk is run by Juraj Kolesár, who is responsible for your data under the EU General Data
          Protection Regulation (GDPR). For anything on this page, write to{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-[color:var(--mint-ink)] underline underline-offset-4">
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="What Walk uses, and why">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-[color:var(--ink)]">Your location.</strong> To show where you are,
            find which city you are in, start the tour near you, give directions and start each
            stop&apos;s story when you arrive. The app asks only for location while it is in use, not
            in the background.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">What you ask for.</strong> The settings you
            choose (length, detail, pace, interests, language), anything you type in your own words,
            the start and end points you pick, and the places you search for.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Your email address, if you sign in.</strong>{" "}
            Signing in is optional and uses a one-time code sent to your email; there is no
            password. When you sign up you can also tell Walk what to call you and what you like to
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
          The legal basis is that you asked for this: Walk cannot build or guide a tour without it
          (GDPR Article 6(1)(b)). Walk does not use your information for anything else, does not sell
          it, and does not build a profile of you.
        </p>
      </Section>

      <Section title="Who it is shared with">
        <p>Walk uses these services to do the work. Each receives only what it needs for its part:</p>
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
            <strong className="text-[color:var(--ink)]">Stadia Maps.</strong> Map tiles on the
            website, place and city search, finding the city you are in, and walking routes. It
            receives what you search for, coordinates of your start point or current position, and the
            tour&apos;s stops.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">OpenStreetMap (Overpass).</strong> Finds trams
            and buses along the route. It receives the route&apos;s points, not who you are.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Wikipedia and Wikimedia.</strong> Photos of
            the stops. It receives the stop&apos;s name and position, never yours. The photo itself is
            loaded straight from Wikimedia, which sees your device&apos;s internet address.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Apple.</strong> In the iPhone app, the map is
            Apple Maps, and if the city cannot be found otherwise, Apple&apos;s own location service
            names it. Apple handles this under its own privacy policy.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Hosting.</strong> The website and its servers
            run on Vercel; the walks kept with accounts and the data for prepared tours are in a
            Neon database, and prepared narration in Cloudflare R2 storage.
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
            <strong className="text-[color:var(--ink)]">With your account.</strong> If you sign in,
            your last 30 walks (the same record your device keeps, including what you asked for and
            where each started) are kept with your account, and Clerk keeps your email address. They
            stay until you delete them: a walk deleted on the profile page is deleted from your
            account too, and &ldquo;Delete account&rdquo; on the profile page deletes the account and
            everything kept with it, on the website and in the app.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">On Walk&apos;s servers, briefly.</strong>{" "}
            Written stories and recorded narration are held in the server&apos;s memory so the same
            stop is not made twice. Nothing is written to disk, and they disappear whenever the server restarts, which happens regularly.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">For prepared tours.</strong> When a tour is
            built from settings alone (nothing typed in your own words) in a city where Walk keeps
            prepared tours, the database records the city, the settings and the starting point
            rounded to about 100 metres, with no way to tell who asked. This shows which tours to
            prepare in advance and is kept until it is no longer useful for that.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Server logs.</strong> Like any website, the
            hosting keeps short-lived technical logs of requests, which can include your internet
            address and, for searches, what was searched for. Walk does not use them except to fix
            faults.
          </li>
        </ul>
      </Section>

      <Section title="What Walk does not do">
        <p>
          No analytics, advertising or tracking of any kind. No selling or renting of your data. The
          only cookies are the ones that keep you signed in, and only once you sign in. Fonts are
          part of the site and the app, not fetched from a third party.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you can ask to see the data Walk holds about you, have it corrected or
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
          Walk is not aimed at children under 16 and does not knowingly collect their information.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If Walk starts handling your information differently, this page will change first, and
          the date at the top will say when.
        </p>
      </Section>
    </main>
  );
}
