"use client";

/**
 * When a screen breaks, say what broke — shared by app/error.tsx and
 * app/global-error.tsx.
 *
 * Next.js's own page said only "This page couldn't load", which left a walker
 * with nothing to report and us with nothing to fix. This keeps the same two
 * ways forward, shows the error's own sentence small underneath, and sends it
 * to the server log (/api/client-error) — the message and where it happened,
 * nothing about who.
 */

import { useEffect } from "react";

export default function ErrorScreen({
  error,
  reset,
  where,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Which boundary caught it, for the log. */
  where?: string;
}) {
  useEffect(() => {
    console.error(error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack?.split("\n").slice(0, 6).join("\n"),
        path: location.pathname,
        agent: navigator.userAgent,
        where,
      }),
    }).catch(() => {});
  }, [error, where]);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-10">
      <h1 className="text-[length:var(--text-h2)]">Something went wrong.</h1>
      <p>This screen hit a problem. Trying again usually works; if it does not, go back to the map.</p>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={reset} className="btn btn--primary btn--lg w-full">
          Try again
        </button>
        {/* A full load rather than a client-side hop: after a crash, start clean. */}
        <button type="button" onClick={() => location.assign("/")} className="btn btn--quiet w-full">
          Back to the map
        </button>
      </div>
      <p className="break-words text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
        {error.message || "Unknown error"}
        {error.digest ? ` · ${error.digest}` : ""}
      </p>
    </main>
  );
}
