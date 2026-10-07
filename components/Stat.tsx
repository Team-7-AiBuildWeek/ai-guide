/** A labelled figure: "Walks built 4", "Walking 52 min". */

export default function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="u-eyebrow">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[length:var(--text-lead)] font-semibold text-[color:var(--ink)]">
        {value}
      </p>
    </div>
  );
}
