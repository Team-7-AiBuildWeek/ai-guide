/**
 * The tab bar floats over the screens (frosted, like the website's), so a
 * screen keeps this much room at its bottom for it. On Explore the landing
 * sheet reaches down behind it instead, so sheet and bar are one pane.
 */

import { useSafeAreaInsets } from "react-native-safe-area-context";

export const TAB_BAR_TOP_PAD = 8;
export const TAB_ROW_PX = 52;

/** The bar's full height from the bottom edge, home indicator included. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_TOP_PAD + TAB_ROW_PX + Math.max(8, insets.bottom);
}
