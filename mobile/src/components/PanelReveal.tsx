/**
 * Panel reveal (after Transitions.dev): a panel slides up half its own height
 * while it fades in, on one duration and ease, so the short travel still reads
 * as a full open; closing is a little quicker. The website adds a 2px blur to
 * this; the phone leaves it out, as it cannot be animated cheaply here.
 *
 * Stays mounted; `open` says which way it is going, and `onClosed` says when a
 * close has finished (for a Modal that must stay up until then).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { EASE, PANEL_CLOSE_MS, PANEL_OPEN_MS, useReduceMotion } from "@/lib/motion";

export default function PanelReveal({
  open,
  onClosed,
  style,
  children,
}: {
  open: boolean;
  onClosed?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const still = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(open ? 1 : 0));
  const [height, setHeight] = useState(0);

  useEffect(() => {
    Animated.timing(shown, {
      toValue: open ? 1 : 0,
      duration: still ? 0 : open ? PANEL_OPEN_MS : PANEL_CLOSE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) onClosed?.();
    });
    // onClosed is a notification, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, still, shown]);

  return (
    <Animated.View
      pointerEvents={open ? "auto" : "none"}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        style,
        {
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
