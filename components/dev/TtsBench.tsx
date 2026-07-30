"use client";

/**
 * Hear a voice without walking through the whole app.
 *
 * One persistent <audio> element, reused for every take — the same discipline
 * the tour player needs, and it means the browser never treats a new clip as a
 * fresh, unblessed media element.
 */

import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/i18n/languages";
import type { Voice } from "@/lib/providers/types";

const SAMPLE =
  "You are standing under the last of four medieval gates into the old town. " +
  "The other three were pulled down when the walls came down; this one survived " +
  "because it kept being useful.";

type Result = { url: string; bytes: number; ms: number; provider: string; seconds: number };

export default function TtsBench({
  voices,
  provider,
  defaultVoice,
}: {
  voices: Voice[];
  provider: string;
  defaultVoice: string;
}) {
  const [text, setText] = useState(SAMPLE);
  const [voice, setVoice] = useState(defaultVoice);
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrl = useRef<string | null>(null);

  // Object URLs are not garbage collected on their own.
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const speak = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lang, voice }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server said ${res.status}.`);
      }

      const ms = Number(res.headers.get("x-tts-ms") ?? 0);
      const from = res.headers.get("x-tts-provider") ?? provider;
      const blob = await res.blob();

      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      const url = URL.createObjectURL(blob);
      lastUrl.current = url;

      // 44-byte header + 24 kHz 16-bit mono, so this is the real duration.
      const seconds = Math.max(0, (blob.size - 44) / (24000 * 2));
      setResult({ url, bytes: blob.size, ms, provider: from, seconds });

      const el = audioRef.current;
      if (el) {
        el.src = url;
        await el.play().catch(() => {
          /* autoplay refused — the controls are right there */
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="tts-text" className="u-eyebrow">
          Text to speak
        </label>
        <textarea
          id="tts-text"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-2 w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-4 leading-relaxed text-[color:var(--ink)]"
        />
        <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
          {text.trim().length} characters · roughly {Math.max(1, Math.round(text.trim().length / 14))}s
          spoken
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tts-voice" className="u-eyebrow">
            Voice
          </label>
          <select
            id="tts-voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="mt-2 min-h-[48px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[color:var(--ink)]"
          >
            {voices.length === 0 ? <option value="">No voices listed</option> : null}
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tts-lang" className="u-eyebrow">
            Language
          </label>
          <select
            id="tts-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="mt-2 min-h-[48px] w-full rounded-[var(--radius-control)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 text-[color:var(--ink)]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.english}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={speak}
        disabled={busy || !text.trim()}
        className="btn btn--primary btn--lg w-full"
      >
        {busy ? "Synthesizing…" : "Speak it"}
      </button>

      {error ? (
        <p className="rounded-[var(--radius-control)] bg-[#fef2f2] p-3 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="card p-4">
        <p className="u-eyebrow">Output</p>
        {/* One element, reused. Never construct a new one per clip. */}
        <audio ref={audioRef} controls className="mt-3 w-full" preload="none" />
        {result ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--text-caption)] sm:grid-cols-4">
            {[
              ["Provider", result.provider],
              ["Latency", `${(result.ms / 1000).toFixed(1)}s`],
              ["Size", `${Math.round(result.bytes / 1024)} KB`],
              ["Duration", `${result.seconds.toFixed(1)}s`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[color:var(--ink-mute)]">{k}</dt>
                <dd className="font-[family-name:var(--font-display)] font-semibold tabular-nums text-[color:var(--ink)]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            Nothing yet.
          </p>
        )}
        {result ? (
          <a
            href={result.url}
            download="tts.wav"
            className="btn btn--quiet mt-4 w-full"
          >
            Download the WAV
          </a>
        ) : null}
      </div>
    </div>
  );
}
