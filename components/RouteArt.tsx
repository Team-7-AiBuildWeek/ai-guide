"use client";

/**
 * A walk, drawn: a few streets, the route drawing itself, the stops popping
 * in — and, with `player`, the player card with its voice going. The paywall's
 * hero shows it once when it opens; the generating screen (`live`) keeps
 * redrawing it while the walk is being built.
 */

export default function RouteArt({ player = false, live = false }: { player?: boolean; live?: boolean }) {
  const stops: [number, number, string][] = [
    [40, 160, "1"],
    [96, 132, "2"],
    [168, 92, "3"],
    [284, 44, "4"],
  ];
  return (
    <div className={`paywall-art${live ? " route-art--live" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 320 200" className="paywall-art__map">
        <g stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" fill="none">
          <path d="M-10 60 H330" />
          <path d="M-10 140 H330" />
          <path d="M70 -10 V210" />
          <path d="M210 -10 V210" />
          <path d="M120 -10 L260 210" />
        </g>
        <path
          className="paywall-art__route"
          d="M40 160 C 70 160, 70 140, 96 132 S 150 90, 168 92 S 214 70, 214 58 S 250 40, 284 44"
          fill="none"
          stroke="#5eda9b"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {stops.map(([x, y, n], i) => (
          <g key={n} className="paywall-art__stop" style={{ animationDelay: `${0.5 + i * 0.25}s` }}>
            <circle cx={x} cy={y} r="13" fill={i === 2 ? "#5eda9b" : "#111827"} stroke="#5eda9b" strokeWidth="3" />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={i === 2 ? "#111827" : "#ffffff"}>
              {n}
            </text>
          </g>
        ))}
      </svg>
      {player ? (
        <div className="paywall-art__player">
          <span className="paywall-art__play">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">Stop 3 · The Old Town Hall</span>
            <span className="paywall-art__bar">
              <span />
            </span>
          </span>
          <span className="paywall-art__wave">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
