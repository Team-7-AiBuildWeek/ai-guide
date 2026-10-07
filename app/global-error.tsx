"use client";

/**
 * The same screen for a crash in the root layout itself (where the fonts and
 * the sign-in provider live), which app/error.tsx cannot catch. It replaces the
 * whole document, so it brings its own <html> and <body>.
 */

import ErrorScreen from "@/components/ErrorScreen";
import "./globals.css";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen {...props} where="root layout" />
      </body>
    </html>
  );
}
