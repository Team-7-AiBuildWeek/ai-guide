import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { CITIES, findCity } from "@/lib/site/cities";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return CITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const city = findCity((await params).slug);
  if (!city) return { title: "City not found — Narro" };
  return { title: `${city.name} — Narro`, description: city.tagline };
}

export default async function CityPage({ params }: Params) {
  const city = findCity((await params).slug);
  if (!city) notFound();

  return (
    <div className="narro">
      <SiteNav />

      <main className="container">
        <section className="page-head" style={{ paddingBottom: 0 }}>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href="/cities">Cities</Link>
            <span>/</span>
            <strong>{city.name}</strong>
          </nav>
        </section>

        <div className="city-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={city.image} alt={city.name} />
          <div className="city-hero-copy">
            <h1>{city.name}</h1>
            <p>
              {city.tagline} · {city.hours} hours narrated · {city.country}
            </p>
          </div>
        </div>

        {/* The planner is the invitation; single routes are the fallback. */}
        <section className="tailor-cta">
          <div className="tailor-copy">
            <h2>Make {city.name} fit your days</h2>
            <p>
              Dates, budget, pace, live weather — answer five quick questions and Narro drafts a
              personal day-by-day itinerary.
            </p>
          </div>
          <Link className="btn btn-primary tailor-btn" href={`/plan?city=${city.slug}`}>
            Build my {city.name} itinerary
          </Link>
        </section>

        <h2 className="routes-title">Prefer to pick a single walk?</h2>
        <div className="route-list">
          {city.routes.map((r) => (
            <div className="route-row" key={r.id}>
              <span className="route-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.6" />
                </svg>
              </span>
              <div className="route-copy">
                <h3>
                  {r.name}
                  {r.free ? <span className="route-free">Free</span> : null}
                </h3>
                <p>{r.blurb}</p>
              </div>
              <div className="route-meta">
                <strong>{r.stops} stops</strong>~{Math.round((r.minutes / 60) * 10) / 10} hrs
              </div>
              <Link
                className="btn btn-outline"
                href={`/walk?brief=${encodeURIComponent(
                  `${r.name} — ${r.blurb} In ${city.name}.`,
                )}&minutes=${r.minutes}&autostart=1&label=${encodeURIComponent(city.name)}`}
              >
                Start walking
              </Link>
            </div>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
