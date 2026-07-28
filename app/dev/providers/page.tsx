/**
 * Step 0 proof: calls all three providers and prints what came back.
 *
 * Server component — the providers read API keys and must never run in the
 * browser. Development aid; it goes away before launch.
 */

import { activeProviders, getLLM, getMaps, getTTS } from "@/lib/providers/factory";
import { config, DEFAULT_CENTER } from "@/lib/config";
import type { TourRequest } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

const SAMPLE_REQUEST: TourRequest = {
  freeText: "Old town history, not too much walking, something about the coronations",
  durationMinutes: 45,
  detail: "story",
  pace: "relaxed",
  interests: ["history", "architecture"],
  start: { ...DEFAULT_CENTER, label: "Hlavné námestie" },
  lang: "en",
};

/**
 * Strip credentials before anything is rendered.
 *
 * `tileStyleUrl()` legitimately carries the key — MapLibre needs it in the
 * browser — but that is no reason to print it on a page you might screenshot,
 * screen-share, or deploy by accident.
 */
function redact(value: unknown): string {
  let out = JSON.stringify(value, null, 2) ?? "";
  out = out.replace(/([?&](?:api_key|access_token|key)=)[^"&\s]+/gi, "$1***");
  for (const secret of Object.values(config)) {
    if (typeof secret === "string" && secret.length >= 16) {
      out = out.split(secret).join("***");
    }
  }
  return out;
}

/** Run a provider call and keep the failure instead of throwing the page away. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[length:var(--text-h3)]">{title}</h2>
        <code className="rounded-[var(--radius-control)] bg-[color:var(--canvas)] px-2 py-1 text-[length:var(--text-caption)] text-[color:var(--ink-soft)]">
          {subtitle}
        </code>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Result({ label, result }: { label: string; result: { ok: boolean; value?: unknown; error?: string } }) {
  return (
    <div>
      <p className="u-eyebrow">{label}</p>
      {result.ok ? (
        <pre className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-control)] bg-[color:var(--canvas)] p-3 text-xs leading-relaxed text-[color:var(--ink-soft)]">
          {redact(result.value)}
        </pre>
      ) : (
        <p className="mt-2 rounded-[var(--radius-control)] bg-[#fef2f2] p-3 text-[length:var(--text-caption)] text-[color:var(--danger)]">
          {result.error}
        </p>
      )}
    </div>
  );
}

export default async function DevProvidersPage() {
  const active = activeProviders();
  const llm = getLLM();
  const tts = getTTS();
  const maps = getMaps();

  const [plan, voices, sample, geocoded, reversed] = await Promise.all([
    attempt(() => llm.generateTourPlan(SAMPLE_REQUEST)),
    attempt(() => tts.listVoices()),
    attempt(async () => {
      const buf = await tts.synthesize("Michalská brána. Testing the voice.", { lang: "sk" });
      return { bytes: buf.byteLength, mimeType: tts.mimeType };
    }),
    attempt(() => maps.geocode("michalska")),
    attempt(() => maps.reverseGeocode(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng)),
  ]);

  // Routing needs the stops, so it waits for the plan.
  const route = plan.ok
    ? await attempt(async () => {
        const r = await maps.walkingRoute(plan.value.stops.map((s) => ({ lat: s.lat, lng: s.lng })));
        return {
          meters: Math.round(r.meters),
          minutes: Math.round(r.seconds / 60),
          geometryType: (r.geojson as { geometry?: { type?: string } }).geometry?.type,
        };
      })
    : { ok: false as const, error: "skipped — no tour plan to route" };

  const style = await attempt(async () => maps.tileStyleUrl());

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <header>
        <p className="u-eyebrow">Step 0</p>
        <h1 className="mt-3 text-[length:var(--text-h2)]">Provider check</h1>
        <p className="u-measure mt-3">
          Every external service behind one interface. Switch any of them with an env var; all
          three default to <code>mock</code>, so this page works with no API keys at all.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="tag">LLM_PROVIDER={active.llm}</span>
          <span className="tag">TTS_PROVIDER={active.tts}</span>
          <span className="tag">MAP_PROVIDER={active.map}</span>
        </div>
      </header>

      <Panel title="LLM" subtitle={`generateTourPlan · ${llm.name}`}>
        <p className="text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          Validated with Zod; a schema failure is retried once with the error fed back to the model.
        </p>
        <Result label="Tour plan" result={plan} />
      </Panel>

      <Panel title="TTS" subtitle={`synthesize / listVoices · ${tts.name}`}>
        <Result label="Voices" result={voices} />
        <Result label="Synthesize" result={sample} />
        <div>
          <p className="u-eyebrow">Playback</p>
          <audio
            className="mt-2 w-full"
            controls
            preload="none"
            src="/api/dev/tts?text=Michalsk%C3%A1%20br%C3%A1na.%20Testing%20the%20voice.&lang=sk"
          />
          <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            The mock returns a real WAV — a tone whose pitch is derived from the text and whose
            length matches a realistic speaking rate, so the player can be built against it.
          </p>
        </div>
      </Panel>

      <Panel title="Maps" subtitle={`geocode / reverse / route / tiles · ${maps.name}`}>
        <Result label={`geocode("michalska")`} result={geocoded} />
        <Result label="reverseGeocode(old town centre)" result={reversed} />
        <Result label="walkingRoute(stops)" result={route} />
        <Result label="tileStyleUrl()" result={style} />
      </Panel>

      <p className="u-eyebrow">Sample request used for all of the above</p>
      <pre className="card overflow-auto p-3 text-xs leading-relaxed text-[color:var(--ink-soft)]">
        {JSON.stringify(SAMPLE_REQUEST, null, 2)}
      </pre>
    </main>
  );
}
