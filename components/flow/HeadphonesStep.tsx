"use client";

/**
 * Step 5: use headphones.
 *
 * Nothing else on this screen. The tap on Start is the user gesture that
 * unlocks audio playback on iOS — that is a technical requirement, not a
 * design flourish, which is why there is no way past this screen except the
 * button.
 */

export default function HeadphonesStep({
  title,
  stopCount,
  minutes,
  onStart,
}: {
  title: string;
  stopCount: number;
  minutes: number;
  onStart: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-8 text-center">
      <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[color:var(--mint-wash)]">
        {/* Headphones, drawn rather than an icon font — one less thing to load. */}
        <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true" fill="none">
          <path
            d="M10 30v-6a14 14 0 0 1 28 0v6"
            stroke="var(--mint-ink)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <rect x="5" y="28" width="9" height="14" rx="4.5" fill="var(--mint-ink)" />
          <rect x="34" y="28" width="9" height="14" rx="4.5" fill="var(--mint-ink)" />
        </svg>
      </div>

      <div>
        <h2 className="text-[length:var(--text-h2)]">Use headphones for the best experience.</h2>
        <p className="u-measure mx-auto mt-4 text-[length:var(--text-lead)]">
          The guide talks as you walk, so keep the phone in your pocket if you like.
        </p>
      </div>

      <p className="text-[color:var(--ink-mute)]">
        {title} · {stopCount} stops · about {minutes} minutes
      </p>

      <button type="button" onClick={onStart} className="btn btn--primary btn--lg w-full">
        Start the tour
      </button>
    </div>
  );
}
