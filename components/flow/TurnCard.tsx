"use client";

/**
 * The next turn, top right of the map.
 *
 * An arrow and a distance, nothing else. A walker glancing at this has one
 * hand on a phone and is already moving, so it has to be readable in the time
 * it takes to look up from the pavement — which rules out a sentence.
 *
 * Tapping it opens the full written cue.
 */

import type { ManeuverKind } from "@/lib/providers/types";
import { formatDistance } from "@/lib/tour/navigation";

/** Drawn rather than an icon font: four shapes is not worth a network request. */
function Arrow({ kind }: { kind: ManeuverKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true">
      {kind === "straight" ? (
        <>
          <path d="M12 21V5" {...common} />
          <path d="M6 11l6-6 6 6" {...common} />
        </>
      ) : kind === "right" ? (
        <>
          <path d="M7 21v-8a4 4 0 0 1 4-4h6" {...common} />
          <path d="M13 4l5 5-5 5" {...common} />
        </>
      ) : kind === "left" ? (
        <>
          <path d="M17 21v-8a4 4 0 0 0-4-4H7" {...common} />
          <path d="M11 4L6 9l5 5" {...common} />
        </>
      ) : kind === "uturn" ? (
        <>
          {/* Up the left side, over the top, back down the right. */}
          <path d="M7 21v-9a5 5 0 0 1 10 0v4" {...common} />
          <path d="M13 12l4 4 4-4" {...common} />
        </>
      ) : (
        // Arrive: a pin, because an arrow would imply there is still a turn.
        <>
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" {...common} />
          <circle cx="12" cy="10" r="2.4" {...common} />
        </>
      )}
    </svg>
  );
}

const LABEL: Record<ManeuverKind, string> = {
  straight: "Carry straight on",
  left: "Turn left",
  right: "Turn right",
  uturn: "Turn back",
  arrive: "You arrive",
};

export default function TurnCard({
  kind,
  meters,
  street,
  onOpen,
  open,
}: {
  kind: ManeuverKind;
  meters: number;
  street?: string;
  onOpen: () => void;
  open: boolean;
}) {
  const distance = formatDistance(meters);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      // Spoken form for anyone not looking at the arrow.
      aria-label={`${LABEL[kind]}${meters >= 10 ? ` in ${distance}` : " now"}${street ? `, ${street}` : ""}. Open directions.`}
      className="panel-dark flex w-[92px] shrink-0 flex-col items-center gap-1 px-2 py-3 active:opacity-85"
    >
      <span className="text-[color:var(--mint)]">
        <Arrow kind={kind} />
      </span>
      <span className="font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold tabular-nums leading-none">
        {distance}
      </span>
      {street ? (
        <span className="w-full truncate text-center text-[length:var(--text-caption)] leading-tight text-[color:var(--on-dark-mute)]">
          {street}
        </span>
      ) : null}
    </button>
  );
}
