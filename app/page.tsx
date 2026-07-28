import Link from "next/link";

/**
 * Landing placeholder, carrying the design language.
 *
 * The real home screen — full-screen map with a bottom sheet — is step 1. This
 * exists so the type, colour and the route spine can be judged on a phone,
 * outdoors, before any of it is load-bearing.
 */

const STOPS = [
  { name: "Michalská brána", note: "The last of four medieval gates" },
  { name: "Hlavné námestie", note: "The cannonball left in the wall" },
  { name: "Primaciálny palác", note: "Where the Peace of Pressburg was signed" },
  { name: "Stará radnica", note: "Three houses pretending to be one" },
  { name: "Modrý kostol", note: "Blue tiles, 1913, unlike anything near it" },
  { name: "Bratislavský hrad", note: "Three countries from one wall" },
];

const FACTS = [
  { value: "45", label: "minutes" },
  { value: "6", label: "stops" },
  { value: "2", label: "languages" },
  { value: "Free", label: "no account" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-14 px-5 py-12">
      {/* ---------------------------------------------------------- hero -- */}
      <header>
        <p className="u-eyebrow">Bratislava · audio walking tour</p>
        <h1 className="mt-3">Walk the old town with someone who knows it.</h1>
        <p className="u-measure mt-5 text-[length:var(--text-lead)] text-[color:var(--ink-soft)]">
          Six stops, about 45 minutes on foot. Put the phone in your pocket and follow the
          voice — it keeps talking between the stops, so you are never walking in silence.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/map" className="btn btn--primary btn--lg">
            Open the map
          </Link>
          <button type="button" className="btn btn--quiet btn--lg" disabled>
            Start the tour
          </button>
        </div>
        <p className="mt-3 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          The map shows your live position. Starting the tour needs the setup screens, which
          are the rest of step 1.
        </p>
      </header>

      {/* --------------------------------------------------------- facts -- */}
      <section aria-label="At a glance">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--line)] sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="bg-[color:var(--surface)] px-4 py-5">
              <dt className="u-eyebrow">{f.label}</dt>
              <dd className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-semibold text-[color:var(--ink)] tabular-nums">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------- route -- */}
      <section>
        <h2>The route</h2>
        <p className="u-measure mt-3">
          Walked in order, west to east and back up to the castle. You can skip ahead at any
          point.
        </p>

        <ol className="spine mt-8">
          {STOPS.map((stop, i) => (
            <li
              key={stop.name}
              className={`spine__item ${i === 0 ? "spine__item--current" : ""}`}
            >
              <span className="spine__node" aria-hidden="true">
                {i + 1}
              </span>
              <p className="spine__title">{stop.name}</p>
              <p className="mt-1 text-[color:var(--ink-soft)]">{stop.note}</p>
              {i === 0 ? <p className="spine__meta mt-1">Starts here</p> : null}
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------------------------------- dev links -- */}
      <section className="panel-dark p-6">
        <p className="u-eyebrow" style={{ color: "var(--on-dark-mute)" }}>
          Build status
        </p>
        <h2 className="mt-2 text-[length:var(--text-h3)]">Step 0 — provider layer. Done.</h2>
        <p className="mt-3 text-[color:var(--on-dark-mute)]">
          Every external service sits behind one interface and defaults to a mock, so the whole
          app runs with no API keys.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dev/providers" className="btn btn--primary">
            Provider check
          </Link>
          <Link href="/dev/design" className="btn btn--quiet">
            Design reference
          </Link>
        </div>
      </section>
    </main>
  );
}
