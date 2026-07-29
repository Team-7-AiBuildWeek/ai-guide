"use client";

import { useEffect, useRef } from "react";
import { mountLandingScripts } from "@/lib/site/landing-scripts";

/** Runs the landing page's DOM behaviour once the markup is on screen. */
export default function LandingScripts() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return; // StrictMode mounts effects twice in dev
    mounted.current = true;
    mountLandingScripts();
  }, []);

  return null;
}
