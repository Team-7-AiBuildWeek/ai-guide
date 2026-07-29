"use client";

/**
 * The planner's shell. The questionnaire and itinerary are rendered by
 * planner-runtime.js into the two containers below.
 */

import { useEffect } from "react";
import { CITIES, findCity } from "@/lib/site/cities";
import { mountPlanner } from "@/lib/site/planner-runtime";

export default function Planner() {
  useEffect(() => {
    mountPlanner(CITIES, findCity);
  }, []);

  return (
    <main className="plan-shell">
      <div className="plan-progress" id="progress" aria-hidden="true" />
      <div className="plan-card" id="card" />
    </main>
  );
}
