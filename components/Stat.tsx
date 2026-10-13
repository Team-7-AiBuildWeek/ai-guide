/**
 * A labelled figure: "4 walks built", "52 min walking". The number leads, big,
 * the way Flighty or Apple Fitness show a figure; the label sits under it in
 * plain sentence case rather than as a grey uppercase form label.
 */

export default function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-[family-name:var(--font-display)] text-[2rem] font-semibold leading-none tracking-[-0.02em] text-[color:var(--ink)] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-[length:var(--text-caption)] text-[color:var(--ink-mute)]">{label}</p>
    </div>
  );
}
