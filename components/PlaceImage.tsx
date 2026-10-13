"use client";

/**
 * A place's real photograph, filling whatever box it is given, faded in once
 * it has arrived (lib/usePlacePhoto.ts). With no photograph it draws nothing,
 * or `fallback` when the caller has something better than a grey box.
 */

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { usePlacePhoto, type Place } from "@/lib/usePlacePhoto";

export default function PlaceImage({
  place,
  className = "",
  sizes = "(max-width: 512px) 100vw, 512px",
  fallback = null,
  children,
  credit = false,
}: {
  place: Place | null;
  className?: string;
  sizes?: string;
  fallback?: ReactNode;
  /** Drawn over the photo (a title on a gradient). */
  children?: ReactNode;
  /** A small "Wikimedia" credit in the corner, linking to where the photo came from. */
  credit?: boolean;
}) {
  const photo = usePlacePhoto(place);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (photo === null) return <>{fallback}</>;
  return (
    <div className={`relative overflow-hidden bg-[color:var(--line)] ${className}`}>
      {photo ? (
        <Image
          src={photo.url}
          alt={place?.name ?? ""}
          fill
          sizes={sizes}
          onLoad={() => setLoaded(photo.url)}
          className={`object-cover transition-opacity duration-500 ${loaded === photo.url ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {children}
      {credit && photo ? (
        <a
          href={photo.page}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-1.5 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/90 backdrop-blur-sm"
        >
          {photo.title} · Wikimedia
        </a>
      ) : null}
    </div>
  );
}
