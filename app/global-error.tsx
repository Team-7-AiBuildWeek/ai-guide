"use client";

/**
 * The same as app/error.tsx, for a crash in the root layout itself (where the
 * fonts and the sign-in provider live), which app/error.tsx cannot catch.
 * It replaces the whole document, so it brings its own <html> and <body>.
 */

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        where: "root layout",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-5 px-5 py-10" style={{ minHeight: "100dvh" }}>
          <h1>Something went wrong.</h1>
          <p>Walk hit a problem while loading. Trying again usually works; if it does not, reload the page.</p>
          <button type="button" onClick={reset} className="btn btn--primary btn--lg w-full">
            Try again
          </button>
          <button type="button" onClick={() => location.assign("/")} className="btn btn--quiet w-full">
            Reload
          </button>
          <p className="break-words text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
            {error.message || "Unknown error"}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </main>
      </body>
    </html>
  );
}
