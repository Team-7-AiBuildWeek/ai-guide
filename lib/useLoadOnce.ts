"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Runs `read` once, on the client, right after the first render is on screen;
 * returns whether it has run.
 *
 * For pages built from localStorage, which is unreadable while they render on
 * the server: reading it in render would mismatch the server's HTML.
 *
 * It used to schedule the read from inside a useSyncExternalStore snapshot —
 * that is, from inside render — so when React rendered the page but had not
 * put it on screen yet, the read's state updates landed on a component that
 * did not exist ("Can't perform a React state update on a component that
 * hasn't mounted yet"). An effect only runs once the component is mounted. The
 * read is still a microtask, so its updates come as one render after the
 * hydrating one rather than inside it.
 */
export function useLoadOnce(read: () => void): boolean {
  const [loaded, setLoaded] = useState(false);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      readRef.current();
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return loaded;
}
