"use client";

/**
 * A photograph of the stop, when there is an honest one.
 *
 * Fetched per stop rather than for the whole walk up front: thirteen lookups
 * at the start would delay the first stop to serve twelve nobody has reached,
 * and most walks are abandoned before the end.
 *
 * Nothing is drawn when there is no photograph, and nothing is drawn while the
 * first one is being looked for — a grey rectangle that may never fill is worse
 * than a screen that quietly gains a picture.
 *
 * Moving between stops is the exception. The frame stays where it is while the
 * next stop's picture is looked up, empty rather than showing the last stop,
 * and only folds away if there turns out to be none. Folding it shut and
 * opening it again a moment later threw the whole player up the sheet and back
 * down on every tap of "next".
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { StopPhoto as Photo } from "@/lib/providers/photos/wikimedia";

const EASE = [0.22, 1, 0.36, 1] as const;

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
  const reduce = useReducedMotion();
  /**
   * Keyed by the stop, so moving on shows nothing rather than the last stop's
   * picture — and so the reset happens as part of rendering the new stop
   * rather than as an effect firing after it.
   */
  const key = `${localName ?? name}|${lat}|${lng}|${lang}`;
  const [found, setFound] = useState<{ key: string; photo: Photo | null } | null>(null);
  const looking = found?.key !== key;
  const photo = looking ? null : found.photo;
  // While looking, `found` is still the last stop's answer: if that had a
  // picture, the frame stays open for this one.
  const open = photo !== null || (looking && !!found?.photo);

  /** The picture fades in once it has arrived, not while it is drawing. */
  const [loaded, setLoaded] = useState<string | null>(null);

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
        if (!cancelled) setFound({ key, photo: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, name, localName, lat, lng, lang]);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="photo"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.36, ease: EASE }}
          className="overflow-hidden"
        >
          <figure className="overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--line)]">
            {/* A wide crop: the sheet is short, and a portrait photograph of a
                tower would push the controls off the screen. */}
            <div className="relative aspect-[16/9] w-full bg-[color:var(--canvas)]">
              {photo ? (
                <Image
                  key={photo.url}
                  src={photo.url}
                  alt={name}
                  fill
                  sizes="(max-width: 512px) 100vw, 512px"
                  onLoad={() => setLoaded(photo.url)}
                  className={`object-cover transition-opacity duration-500 ease-out ${loaded === photo.url ? "opacity-100" : "opacity-0"}`}
                />
              ) : null}
            </div>
            {/* The caption keeps its line while the next picture is found, so
                the frame does not change height under it. */}
            <figcaption
              className={`px-3 py-2 text-[length:var(--text-caption)] text-[color:var(--ink-mute)] transition-opacity duration-300 ${photo ? "opacity-100" : "opacity-0"}`}
            >
              {photo ? (
                <>
                  <a
                    href={photo.page}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {photo.title}
                  </a>{" "}
                  · Wikimedia
                </>
              ) : (
                " "
              )}
            </figcaption>
          </figure>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
