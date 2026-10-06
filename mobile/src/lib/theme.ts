/**
 * The website's design language, carried over value for value (app/globals.css).
 *
 * Space Grotesk for display, Inter for reading. Mint is a fill, never text on
 * white (1.75:1); when the green has to be text it is mintInk. No dark mode:
 * this is read outdoors in sunlight.
 */

import { StyleSheet } from "react-native";

export const colors = {
  ink: "#111827", // headings
  inkSoft: "#374151", // body copy
  inkMute: "#6b7280", // captions, secondary
  canvas: "#f9fafb", // page
  surface: "#ffffff", // cards
  line: "#e5e7eb",
  lineStrong: "#d1d5db",
  dark: "#1f1f1f", // player chrome, map overlays
  darkSoft: "#2a2e2c",
  onDark: "#f9fafb",
  onDarkMute: "#9ca3af",
  mint: "#5eda9b", // fill only
  mintPress: "#4bc98a",
  mintWash: "#eafaf2",
  mintInk: "#1e7a52", // the green when it must be text
  danger: "#b91c1c",
  warn: "#fbbf24", // only on the dark overlays
  transit: "#2563eb", // the ridden part of a route
};

export const fonts = {
  display: "SpaceGrotesk_600SemiBold",
  displayMedium: "SpaceGrotesk_500Medium",
  displayBold: "SpaceGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
};

/** The website's 16px base and 1.25 ratio. */
export const size = {
  caption: 14.2, // 0.889rem
  body: 16,
  lead: 20,
  h3: 25,
  h2: 28,
  h1: 34,
};

export const radius = {
  control: 12,
  pill: 999,
  card: 16,
  panel: 22,
};

/** --shadow-lift and --shadow-card, as near as iOS shadows get. */
export const shadow = StyleSheet.create({
  lift: { shadowColor: "#111827", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  card: { shadowColor: "#111827", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
});

export const type = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: size.h1, lineHeight: size.h1 * 1.1, letterSpacing: -0.6, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: size.h2, lineHeight: size.h2 * 1.15, letterSpacing: -0.5, color: colors.ink },
  h3: { fontFamily: fonts.display, fontSize: size.h3, lineHeight: size.h3 * 1.15, letterSpacing: -0.4, color: colors.ink },
  lead: { fontFamily: fonts.display, fontSize: size.lead, lineHeight: size.lead * 1.25, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: size.body, lineHeight: size.body * 1.6, color: colors.inkSoft },
  caption: { fontFamily: fonts.body, fontSize: size.caption, lineHeight: size.caption * 1.45, color: colors.inkMute },
  /** .u-eyebrow */
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: size.caption,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.inkMute,
  },
  link: {
    fontFamily: fonts.displayMedium,
    fontSize: size.body,
    color: colors.mintInk,
    textDecorationLine: "underline",
  },
});
