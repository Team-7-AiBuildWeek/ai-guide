"use client";

/**
 * A real photograph of a place — a city, or a stop — from the same lookup the
 * walk's stop photos use (/api/stops/photo, Wikimedia, components/flow/StopPhoto.tsx),
 * for cards and headers that should show the place rather than describe it.
 *
 * One cache for the page, so the same place shown in two cards is looked up
 * once. `undefined` while looking, `null` when there is no honest photograph —
 * and then callers draw nothing photographic at all: a grey box that never
 * fills is worse than a card that is just text.
 */

import { useEffect, useState } from "react";
import type { StopPhoto } from "@/lib/providers/photos/wikimedia";

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
  const params = new URLSearchParams({
    name: p.name,
    lat: String(p.lat),
    lng: String(p.lng),
    lang: p.lang,
    ...(p.localName ? { localName: p.localName } : {}),
    ...(p.kind ? { kind: p.kind } : {}),
  });
  const job = fetch(`/api/stops/photo?${params}`)
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
