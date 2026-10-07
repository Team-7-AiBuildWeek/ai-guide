"use client";

/** A screen that breaks says what broke — see components/ErrorScreen.tsx. */

import ErrorScreen from "@/components/ErrorScreen";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />;
}
