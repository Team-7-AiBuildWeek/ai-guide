"use client";

/**
 * The bar along the bottom: Explore, Tours, Account — the same three tabs as
 * the iPhone app.
 *
 * Laid out like Airbnb's: white, a hairline on top, an icon over each label,
 * and the tab you are on in the one green that may be text (mint-ink). It sits
 * on the three home screens only, drawn once by the layout so it stays put
 * between them and the pill can slide; building a tour and walking one take
 * the whole screen, the way a booking does (TourFlow marks the page
 * data-immersive, which hides it).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The bar's own height, above the home indicator. */
export const TAB_BAR_PX = 64;

/** How far the bar reaches up from the bottom edge, home indicator included — for anything that sits on it. */
export const ABOVE_TAB_BAR = `calc(${TAB_BAR_PX}px + env(safe-area-inset-bottom))`;

const TABS: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: "/",
    label: "Explore",
    // A folded map.
    icon: <path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11V20" />,
  },
  {
    href: "/tours",
    label: "Tours",
    // Three stops on a route: the Walk mark.
    icon: (
      <>
        <path d="M6 18 12 9l6 4.5" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="12" cy="9" r="2.5" />
        <circle cx="18" cy="13.5" r="2" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Account",
    // A person in a circle.
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="10" r="3" />
        <path d="M6.6 18.2C7.8 16.3 9.8 15 12 15s4.2 1.3 5.4 3.2" />
      </>
    ),
  },
];

/** On these three, the bar shows (unless a screen has asked for the whole screen). */
const HOMES = TABS.map((t) => t.href);

export default function TabBar() {
  const path = usePathname();
  const index = TABS.findIndex((t) => (t.href === "/" ? path === "/" : path.startsWith(t.href)));
  if (!HOMES.some((h) => (h === "/" ? path === "/" : path.startsWith(h)))) return null;
  return (
    <nav
      aria-label="Main"
      className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--line)] bg-[color:var(--surface)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="relative mx-auto flex w-full max-w-lg" style={{ height: TAB_BAR_PX }}>
        {/* The pill behind the tab you are on. Tabs are equal widths, so its
            place is the tab's index; the bar stays mounted across pages, so a
            change of index slides it (see .tabbar-pill in globals.css). */}
        <span
          aria-hidden="true"
          className="tabbar-pill"
          style={{ width: `${100 / TABS.length}%`, transform: `translateX(${index * 100}%)` }}
        />
        {TABS.map((tab, i) => {
          const on = i === index;
          return (
            <li key={tab.href} className="relative z-[1] flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`tabbar-tab flex h-full flex-col items-center justify-center gap-1 text-[12px] font-medium ${
                  on ? "text-[color:var(--mint-ink)]" : "text-[color:var(--ink-mute)]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={on ? 2.1 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                <span className="font-[family-name:var(--font-display)]">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
