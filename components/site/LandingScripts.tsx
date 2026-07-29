"use client";

import { useEffect } from "react";
import { mountLandingScripts } from "@/lib/site/landing-scripts";

/** Runs the landing page's DOM behaviour once the markup is on screen. */
export default function LandingScripts() {
  useEffect(() => {
    mountLandingScripts();
  }, []);

  return null;
}
