import type { Metadata } from "next";
import Link from "next/link";
import Planner from "@/components/site/Planner";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";

export const metadata: Metadata = {
  title: "Plan a trip — Narro",
  description:
    "Answer a few questions and Narro drafts a day-by-day walking itinerary, tuned to your pace, your budget, and the weather.",
};

export default function PlanPage() {
  return (
    <div className="narro">
      <SiteNav />

      <section className="page-head container" style={{ paddingBottom: 10 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <strong>Plan a trip</strong>
        </nav>
        <h1 className="page-title">
          Your trip, <em>already narrated</em>
        </h1>
        <p className="page-sub">
          Answer a few questions and Narro drafts a day-by-day walking itinerary — tuned to your
          pace, your budget, and the weather. Every day hands off to the guide in your ear.
        </p>
      </section>

      <Planner />
      <SiteFooter />
    </div>
  );
}
