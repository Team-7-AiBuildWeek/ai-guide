/**
 * Design reference.
 *
 * Every token in one place, so the language can be checked on a real phone
 * outdoors rather than argued about on a desktop monitor. Contrast ratios are
 * computed here rather than asserted, because "looks fine indoors" is not the
 * test this app has to pass.
 */

export const metadata = { title: "Design reference" };

// ---------------------------------------------------------------- contrast

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#111827";
const WHITE = "#ffffff";

const PALETTE = [
  { name: "ink", hex: INK, use: "Headings", on: WHITE },
  { name: "ink-soft", hex: "#374151", use: "Body copy", on: WHITE },
  { name: "ink-mute", hex: "#6b7280", use: "Captions", on: WHITE },
  { name: "mint", hex: "#5eda9b", use: "Primary fill — ink on top", on: INK },
  { name: "mint-ink", hex: "#1e7a52", use: "Green when it must be text", on: WHITE },
  { name: "dark", hex: "#1f1f1f", use: "Player chrome", on: "#f9fafb" },
  { name: "dark-soft", hex: "#2a2e2c", use: "Map overlays", on: "#f9fafb" },
  { name: "canvas", hex: "#f9fafb", use: "Page", on: INK },
];

const SCALE = [
  { token: "--text-h1", label: "Display", sample: "Walk the old town", cls: "text-[length:var(--text-h1)] font-[family-name:var(--font-display)] font-semibold tracking-[-0.02em] leading-[1.1] text-[color:var(--ink)]" },
  { token: "--text-h2", label: "Section", sample: "The route", cls: "text-[length:var(--text-h2)] font-[family-name:var(--font-display)] font-semibold tracking-[-0.02em] text-[color:var(--ink)]" },
  { token: "--text-h3", label: "Card title", sample: "Michalská brána", cls: "text-[length:var(--text-h3)] font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]" },
  { token: "--text-lead", label: "Lead / stop name", sample: "Six stops, about 45 minutes on foot.", cls: "text-[length:var(--text-lead)]" },
  { token: "--text-body", label: "Body — 18px floor", sample: "You are standing under the last of four medieval gates into the old town.", cls: "text-[length:var(--text-body)]" },
  { token: "--text-caption", label: "Caption — never prose", sample: "Stop 3 of 6 · 4 min", cls: "text-[length:var(--text-caption)] text-[color:var(--ink-mute)]" },
];

function Ratio({ value }: { value: number }) {
  const passes = value >= 4.5;
  return (
    <span
      className="tag"
      style={
        passes
          ? undefined
          : { background: "#fef2f2", color: "var(--danger)" }
      }
    >
      {value.toFixed(1)}:1 {passes ? "AA" : "fill only"}
    </span>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[color:var(--line)] pt-8">
      <h2>{title}</h2>
      {note ? <p className="u-measure mt-2">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function DesignReferencePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-12 px-5 py-12">
      <header>
        <p className="u-eyebrow">Design reference</p>
        <h1 className="mt-3">The language</h1>
        <p className="u-measure mt-4">
          Adapted from smaut.tech: Space Grotesk over Inter, the mint accent, near-black
          surfaces, a tight control radius against softer cards. Rebased to 18px and 48px
          controls, because this is read in sunlight by someone who is walking.
        </p>
      </header>

      <Section
        title="Colour"
        note="Mint is a fill, never text on white — it is 1.75:1 there. On ink it is 10:1, which is why the primary button puts ink on mint rather than white on near-black."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {PALETTE.map((c) => (
            <li key={c.name} className="card overflow-hidden">
              <div
                className="flex h-20 items-center justify-center font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold"
                style={{ background: c.hex, color: c.on }}
              >
                Aa
              </div>
              <div className="flex items-start justify-between gap-3 p-3">
                <div>
                  <p className="font-[family-name:var(--font-display)] font-semibold text-[color:var(--ink)]">
                    {c.name}
                  </p>
                  <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
                    {c.hex.toUpperCase()} · {c.use}
                  </p>
                </div>
                <Ratio value={contrast(c.hex, c.on)} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type" note="18px base, 1.25 ratio — the source's ratio, rebased from its 16px.">
        <ul className="space-y-6">
          {SCALE.map((s) => (
            <li key={s.token}>
              <p className="u-eyebrow">
                {s.label} · <code>{s.token}</code>
              </p>
              <p className={`mt-2 ${s.cls}`}>{s.sample}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Controls" note="Every one clears 44px. The large variant is 60px — that is the play button.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn--primary btn--lg">
            Start the tour
          </button>
          <button type="button" className="btn btn--primary">
            Play
          </button>
          <button type="button" className="btn btn--dark">
            Next stop
          </button>
          <button type="button" className="btn btn--quiet">
            Full version
          </button>
          <button type="button" className="btn btn--quiet" disabled>
            Disabled
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="tag">Playing</span>
          <span className="tag tag--quiet">Short · 40 sec</span>
          <span className="tag tag--quiet">Full · 3 min</span>
        </div>
      </Section>

      <Section
        title="Route spine"
        note="The signature, lifted from the source's six-step timeline. Numbering earns its place here: the stops are walked in order, so the number is the instruction."
      >
        <ol className="spine">
          <li className="spine__item spine__item--done">
            <span className="spine__node" aria-hidden="true">
              1
            </span>
            <p className="spine__title">Michalská brána</p>
            <p className="spine__meta mt-1">Done</p>
          </li>
          <li className="spine__item spine__item--current">
            <span className="spine__node" aria-hidden="true">
              2
            </span>
            <p className="spine__title">Hlavné námestie</p>
            <p className="mt-1 text-[color:var(--ink-soft)]">The cannonball left in the wall.</p>
            <p className="spine__meta mt-1">Playing · 1:12 of 3:04</p>
          </li>
          <li className="spine__item">
            <span className="spine__node" aria-hidden="true">
              3
            </span>
            <p className="spine__title">Primaciálny palác</p>
            <p className="spine__meta mt-1">4 min walk</p>
          </li>
        </ol>
      </Section>

      <Section
        title="Dark surface"
        note="The player lives on top of a map, so it takes the source's near-black rather than another white card."
      >
        <div className="panel-dark p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="u-eyebrow" style={{ color: "var(--on-dark-mute)" }}>
              Stop 2 of 6
            </p>
            <p className="text-[length:var(--text-caption)] tabular-nums text-[color:var(--on-dark-mute)]">
              1:12 / 3:04
            </p>
          </div>
          <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-h3)] font-semibold">
            Hlavné námestie
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--dark-soft)]">
            <div className="h-full w-[38%] rounded-full bg-[color:var(--mint)]" />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn--primary">
              Pause
            </button>
            <button type="button" className="btn btn--quiet">
              Full version
            </button>
          </div>
        </div>
      </Section>
    </main>
  );
}
