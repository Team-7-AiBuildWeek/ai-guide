"use client";

import { useState, useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * Runs `read` once, on the client, right after hydration; returns whether it
 * has run.
 *
 * For pages built from localStorage, which is unreadable while they render on
 * the server: reading it in render would mismatch the server's HTML, and an
 * effect that sets state cascades a render. This defers the read a tick past
 * the hydrating render instead.
 */
export function useLoadOnce(read: () => void): boolean {
  const [loaded, setLoaded] = useState(false);
  useSyncExternalStore(
    never,
    () => {
      if (!loaded)
        queueMicrotask(() => {
          read();
          setLoaded(true);
        });
      return loaded;
    },
    () => false,
  );
  return loaded;
}
