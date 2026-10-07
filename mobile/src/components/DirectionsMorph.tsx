/**
 * The turn card, top right, grown open into the walking directions — the
 * website's components/flow/DirectionsMorph.tsx, after Transitions.dev's
 * "Plus to menu morph".
 *
 * One dark-glass surface: closed it is the card, open it is the directions.
 * Width, height and corner radius animate out of the card's top-right corner
 * (a bouncier ease opening than closing), so the panel comes out of the thing
 * you tapped; the card's contents slide and fade out as the directions fade
 * and scale in. Both sizes are measured from what they hold. The website adds
 * a 2px blur to the cross-fade; the phone leaves it out.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { GlassSurface } from "@/components/Glass";
import { EASE, useReduceMotion } from "@/lib/motion";
import { radius } from "@/lib/theme";

const OPEN_MS = 350;
const CLOSE_MS = 250;
const OPEN_EASE = Easing.bezier(0.34, 1.25, 0.64, 1);
const SLIDE = 40;
const SCALE = 0.97;

export default function DirectionsMorph({
  open,
  onToggle,
  trigger,
  triggerLabel,
  closedRadius = radius.panel,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  trigger: ReactNode;
  triggerLabel: string;
  closedRadius?: number;
  children: ReactNode;
}) {
  const still = useReduceMotion();
  const { width: screen } = useWindowDimensions();
  const openWidth = Math.min(screen - 32, 512);
  const [closed, setClosed] = useState({ w: 92, h: 92 });
  const [openHeight, setOpenHeight] = useState(280);
  const [progress] = useState(() => new Animated.Value(open ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: still ? 0 : open ? OPEN_MS : CLOSE_MS,
      easing: open ? OPEN_EASE : EASE,
      // Width, height and radius are layout: they cannot run on the native driver.
      useNativeDriver: false,
    }).start();
  }, [open, still, progress]);

  const between = <T extends number>(a: T, b: T) => progress.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  // The contents cross-fade over the first part of the morph, as the website's 200ms fade does.
  const fadeIn = progress.interpolate({ inputRange: [0, 0.57, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });
  const fadeOut = progress.interpolate({ inputRange: [0, 0.57, 1], outputRange: [1, 0, 0], extrapolate: "clamp" });

  return (
    // Holds the card's place in the bar; the surface grows out of its top-right corner.
    <View style={{ width: closed.w, height: closed.h }}>
      <Animated.View
        style={[
          styles.surface,
          { width: between(closed.w, openWidth), height: between(closed.h, openHeight), borderRadius: between(closedRadius, radius.panel) },
        ]}
      >
        <GlassSurface tone="dark" style={StyleSheet.absoluteFill} />
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
          style={[
            styles.corner,
            { width: openWidth, opacity: fadeIn, transform: [{ translateX: between(SLIDE, 0) }, { scale: between(SCALE, 1) }] },
          ]}
        >
          <View onLayout={(e) => setOpenHeight(e.nativeEvent.layout.height)}>{children}</View>
        </Animated.View>
        <Animated.View
          pointerEvents={open ? "none" : "auto"}
          style={[styles.corner, { opacity: fadeOut, transform: [{ translateX: between(0, -SLIDE) }] }]}
        >
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={triggerLabel}
            accessibilityState={{ expanded: open }}
            onLayout={(e) => setClosed({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {trigger}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { position: "absolute", top: 0, right: 0, overflow: "hidden" },
  corner: { position: "absolute", top: 0, right: 0 },
});
