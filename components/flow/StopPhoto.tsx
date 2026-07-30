"use client";

/**
 * A photograph of the stop, when there is an honest one.
 *
 * Fetched per stop rather than for the whole walk up front: thirteen lookups
 * at the start would delay the first stop to serve twelve nobody has reached,
 * and most walks are abandoned before the end.
 *
 * Nothing is drawn when there is no photograph, and nothing is drawn while one
 * is being looked for — a grey rectangle that may never fill is worse than a
 * screen that quietly gains a picture.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import type { StopPhoto as Photo } from "@/lib/providers/photos/wikimedia";

export default function StopPhoto({
  name,
  localName,
  lat,
  lng,
  lang,
}: {
  name: string;
  localName?: string;
  lat: number;
  lng: number;
  lang: string;
}) {
  /**
   * Keyed by the stop, so moving on shows nothing rather than the last stop's
   * picture — and so the reset happens as part of rendering the new stop
   * rather than as an effect firing after it.
   */
  const key = `${localName ?? name}|${lat}|${lng}|${lang}`;
  const [found, setFound] = useState<{ key: string; photo: Photo | null }>({ key, photo: null });
  const photo = found.key === key ? found.photo : null;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      name,
      lat: String(lat),
      lng: String(lng),
      lang,
      ...(localName ? { localName } : {}),
    });
    void (async () => {
      try {
        const res = await fetch(`/api/stops/photo?${params}`);
        const body = (await res.json()) as { photo?: Photo | null };
        if (!cancelled) setFound({ key, photo: body.photo ?? null });
      } catch {
        /* No picture is a normal outcome; a failed lookup is the same outcome. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, name, localName, lat, lng, lang]);

  if (!photo) return null;

  return (
    <figure className="overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--line)]">
      {/* A wide crop: the sheet is short, and a portrait photograph of a tower
          would push the controls off the screen. */}
      <div className="relative aspect-[16/9] w-full bg-[color:var(--canvas)]">
        <Image
          src={photo.url}
          alt={name}
          fill
          sizes="(max-width: 512px) 100vw, 512px"
          className="object-cover"
        />
      </div>
      <figcaption className="px-3 py-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">
        <a
          href={photo.page}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          {photo.title}
        </a>{" "}
        · Wikimedia
      </figcaption>
    </figure>
  );
}
