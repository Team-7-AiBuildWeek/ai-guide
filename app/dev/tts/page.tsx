/**
 * Voice bench. Server component so the voice list is fetched with the key on
 * this side of the wire; the bench itself is a client component that talks to
 * /api/dev/tts.
 */

import Link from "next/link";
import TtsBench from "@/components/dev/TtsBench";
import { getTTS, activeProviders } from "@/lib/providers/factory";
import type { Voice } from "@/lib/providers/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voice bench" };

export default async function TtsDevPage() {
  const tts = getTTS();
  const active = activeProviders();

  let voices: Voice[] = [];
  let error: string | null = null;
  try {
    voices = await tts.listVoices();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10">
      <header>
        <p className="u-eyebrow">Development</p>
        <h1 className="mt-3 text-[length:var(--text-h2)]">Voice bench</h1>
        <p className="u-measure mt-3">
          Hear a voice without walking through the whole app. Synthesis runs on the server —
          the key never reaches this page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="tag">TTS_PROVIDER={active.tts}</span>
          <span className="tag tag--quiet">{tts.mimeType}</span>
          <span className="tag tag--quiet">{voices.length} voices</span>
        </div>
      </header>

      {error ? (
        <p className="rounded-[var(--radius-control)] bg-[#fef2f2] p-3 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      <TtsBench
        voices={voices}
        provider={tts.name}
        defaultVoice={voices.find((v) => v.id === "Charon")?.id ?? voices[0]?.id ?? ""}
      />

      <nav className="flex flex-wrap gap-3">
        <Link href="/dev/providers" className="btn btn--quiet">Provider check</Link>
        <Link href="/" className="btn btn--quiet">The app</Link>
      </nav>
    </main>
  );
}
