import type { Metadata } from "next";
import Link from "next/link";
import CityGrid from "@/components/site/CityGrid";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { CITIES } from "@/lib/site/cities";

export const metadata: Metadata = {
  title: "Cities — Narro",
  description: "Every route written by local historians, then narrated live by your guide.",
};

export default function CitiesPage() {
  return (
    <div className="narro">
      <SiteNav />

      <section className="page-head container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <strong>Cities</strong>
        </nav>
        <h1 className="page-title">
          Cities that <em>talk back</em>
        </h1>
        <p className="page-sub">
          Every route written by local historians, then narrated live by your guide. The first
          route in every city is free — and there are {CITIES.length} to start from.
        </p>
      </section>

      <CityGrid />
      <SiteFooter />
    </div>
  );
}
