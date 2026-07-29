"use client";

/**
 * The planner's shell. The questionnaire and itinerary are rendered by
 * planner-runtime.js into the two containers below.
 */

import { useEffect, useRef } from "react";
import { CITIES, findCity } from "@/lib/site/cities";
import { mountPlanner } from "@/lib/site/planner-runtime";

export default function Planner() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return; // StrictMode mounts effects twice in dev
    mounted.current = true;
    mountPlanner(CITIES, findCity);
  }, []);

  return (
    <main className="plan-shell">
      <div className="plan-progress" id="progress" aria-hidden="true" />
      <div className="plan-card" id="card" />
    </main>
  );
}
