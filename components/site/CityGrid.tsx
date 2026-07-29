"use client";

/**
 * The city catalogue with its search box. Client-side because the filter has
 * to react as you type; the list itself is small enough to ship whole.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { CITIES } from "@/lib/site/cities";

type City = (typeof CITIES)[number];

export default function CityGrid() {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter(
      (c: City) =>
        c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      <div className="city-search">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.8-3.8" />
        </svg>
        <input
          type="search"
          placeholder="Search a city…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search a city"
        />
      </div>

      <div className="container">
        <div className="cities-grid">
          {shown.length === 0 ? (
            <p className="cities-empty">
              No city matches that — yet. New cities land every month.
            </p>
          ) : (
            shown.map((city: City) => {
              const free = city.routes.some((r) => r.free);
              return (
                <Link className="dest-card" key={city.slug} href={`/cities/${city.slug}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={city.image} alt={city.name} loading="lazy" />
                  <span className="dest-tag">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
                      <path d="M20 15a2 2 0 0 1-2 2h-1v-4h1a2 2 0 0 1 2 2ZM4 15a2 2 0 0 0 2 2h1v-4H6a2 2 0 0 0-2 2Z" />
                    </svg>{" "}
                    {city.routes.length} {city.routes.length === 1 ? "route" : "routes"}
                  </span>
                  <div className="dest-info">
                    <div>
                      <h3>{city.name}</h3>
                      <p>{city.hours} hrs narrated</p>
                    </div>
                    {free ? <span className="dest-price">Free</span> : null}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
