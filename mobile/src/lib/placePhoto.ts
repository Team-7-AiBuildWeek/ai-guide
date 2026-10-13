/**
 * A real photograph of a place — a city or a stop — from the website's photo
 * lookup (/api/stops/photo, Wikimedia), for cards and headers that show the
 * place instead of describing it. The website's lib/usePlacePhoto.ts.
 *
 * One cache for the app, so a place shown twice is looked up once.
 * `undefined` while looking, `null` when there is no honest photograph — and
 * then callers draw nothing photographic at all.
 */

import { useEffect, useState } from "react";
import { BASE } from "./api";
import type { StopPhoto } from "./types";

export type Place = {
  name: string;
  localName?: string;
  lat: number;
  lng: number;
  lang: string;
  /** A whole city rather than a stop: matched by name, much further from the point. */
  kind?: "city";
};

const cache = new Map<string, StopPhoto | null>();
const inflight = new Map<string, Promise<StopPhoto | null>>();

const keyOf = (p: Place) => `${p.kind ?? "stop"}|${p.lang}|${p.localName ?? p.name}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;

function lookup(p: Place): Promise<StopPhoto | null> {
  const key = keyOf(p);
  const hit = inflight.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ name: p.name, lat: String(p.lat), lng: String(p.lng), lang: p.lang });
  if (p.localName) params.set("localName", p.localName);
  if (p.kind) params.set("kind", p.kind);
  const job = fetch(`${BASE}/api/stops/photo?${params.toString()}`)
    .then((r) => (r.ok ? r.json() : { photo: null }))
    .then((b: { photo?: StopPhoto | null }) => b.photo ?? null)
    .catch(() => null)
    .then((photo) => {
      cache.set(key, photo);
      inflight.delete(key);
      return photo;
    });
  inflight.set(key, job);
  return job;
}

export function usePlacePhoto(place: Place | null): StopPhoto | null | undefined {
  const key = place ? keyOf(place) : null;
  const [found, setFound] = useState<{ key: string; photo: StopPhoto | null } | null>(null);
  useEffect(() => {
    if (!place || !key || cache.has(key)) return;
    let live = true;
    void lookup(place).then((photo) => live && setFound({ key, photo }));
    return () => {
      live = false;
    };
    // `key` stands for the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  return found?.key === key ? found.photo : undefined;
}
