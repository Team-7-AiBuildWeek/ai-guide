/**
 * The website's BottomSheet, natively: one sheet over the map whose contents
 * and height change while the map stays put.
 *
 * Three heights. Collapsed is as tall as its contents (the landing card, the
 * mini player) and is a control strip, so it is glass; half and full are for
 * reading, so they are solid. Only the walk can be dragged: the bar at the top
 * follows the finger and lands on the nearest height, or the next one on a
 * flick.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./Glass";
import { colors, radius, shadow, type } from "@/lib/theme";

export type SheetHeight = "collapsed" | "half" | "full";

const ORDER: SheetHeight[] = ["collapsed", "half", "full"];
const HALF = 0.55;
const FLICK = 0.6; // pt per ms

export default function Sheet({
  height,
  onHeightChange,
  title,
  onCollapse,
  footer,
  collapsedContent,
  children,
}: {
  height: SheetHeight;
  onHeightChange?: (h: SheetHeight) => void;
  title?: string;
  onCollapse?: () => void;
  footer?: ReactNode;
  collapsedContent?: ReactNode;
  children?: ReactNode;
}) {
  const { height: screen } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [collapsedPx, setCollapsedPx] = useState(160);
  const px = useCallback(
    (h: SheetHeight) => (h === "collapsed" ? collapsedPx : h === "half" ? screen * HALF : screen),
    [collapsedPx, screen],
  );
  const [anim] = useState(() => new Animated.Value(height === "full" ? screen : height === "half" ? screen * HALF : 160));
  /** Collapsed sits at its natural height once it has arrived there; anything else is drawn at a fixed one. */
  const [mode, setMode] = useState<"collapsed" | "open">(height === "collapsed" ? "collapsed" : "open");
  const [shownHeight, setShownHeight] = useState(height);
  if (shownHeight !== height) {
    setShownHeight(height);
    if (height !== "collapsed") setMode("open");
  }
  const draggable = !!onHeightChange;

  // Glide to the new height; collapsing finishes by handing back to the natural one.
  useEffect(() => {
    if (height === "collapsed" && mode === "collapsed") return;
    Animated.spring(anim, { toValue: px(height), useNativeDriver: false, bounciness: 4, speed: 14 }).start(({ finished }) => {
      if (finished && height === "collapsed") setMode("collapsed");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, screen]);

  // The gesture handler is made once and reads the latest of these.
  const latest = useRef({ px, height, mode, draggable, onHeightChange, screen });
  useEffect(() => {
    latest.current = { px, height, mode, draggable, onHeightChange, screen };
  });

  // Made once. The handlers only read `latest` when a finger moves, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    let start = 0;
    /** A drag that began on the collapsed strip opens the sheet when it ends. */
    let fromCollapsed = false;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        latest.current.draggable && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        fromCollapsed = latest.current.mode === "collapsed";
        if (!fromCollapsed) anim.stopAnimation((v) => (start = v));
      },
      onPanResponderMove: (_, g) => {
        if (fromCollapsed) return;
        anim.setValue(Math.max(72, Math.min(latest.current.screen, start - g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const { px: at, height: now, onHeightChange: change } = latest.current;
        if (fromCollapsed) {
          if (g.dy < -20) change?.(g.vy < -FLICK * 2 ? "full" : "half");
          return;
        }
        const landed = start - g.dy;
        let target = ORDER.reduce((best, h) => (Math.abs(at(h) - landed) < Math.abs(at(best) - landed) ? h : best));
        if (Math.abs(g.vy) > FLICK) {
          const from = ORDER.indexOf(target);
          target = ORDER[Math.max(0, Math.min(ORDER.length - 1, from + (g.vy < 0 ? 1 : -1)))];
        }
        if (target !== now) change?.(target);
        else Animated.spring(anim, { toValue: at(now), useNativeDriver: false, bounciness: 4, speed: 14 }).start();
      },
    });
  });

  const tapBar = () => {
    if (!draggable) return;
    if (height === "collapsed") onHeightChange?.("half");
    else onCollapse?.();
  };

  const bar = (
    <Pressable onPress={tapBar} accessibilityRole={draggable ? "adjustable" : undefined} accessibilityLabel={draggable ? "Drag to resize" : undefined} style={styles.bar}>
      <View style={styles.grabber} />
      {onCollapse && !title ? (
        <Pressable onPress={onCollapse} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.chevron}>
          <Text style={styles.chevronText}>▾</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );

  if (mode === "collapsed") {
    return (
      // Rises with the keyboard, so a search typed into the card (choosing a
      // city on the first screen) stays above it.
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.dock}
        pointerEvents="box-none"
      >
        <GlassSurface style={styles.collapsed}>
          <View
            {...responder.panHandlers}
            onLayout={(e) => {
              setCollapsedPx(e.nativeEvent.layout.height);
              anim.setValue(e.nativeEvent.layout.height);
            }}
            style={{ paddingBottom: Math.max(16, insets.bottom) }}
          >
            {bar}
            <View style={styles.collapsedBody}>{collapsedContent}</View>
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    );
  }

  const full = height === "full";
  return (
    <Animated.View style={[styles.dock, styles.sheet, full && styles.sheetFull, { height: anim }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View {...responder.panHandlers} style={[styles.header, full && { paddingTop: Math.max(4, insets.top) }]}>
          {bar}
          {title ? (
            <View style={styles.titleRow}>
              {onCollapse ? (
                <Pressable
                  onPress={onCollapse}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 0.975 }] }]}
                >
                  <Text style={styles.backText}>←</Text>
                </Pressable>
              ) : null}
              <Text style={type.h3}>{title}</Text>
            </View>
          ) : null}
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, !footer && { paddingBottom: Math.max(16, insets.bottom) + 8 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  collapsed: {
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
  },
  collapsedBody: { paddingHorizontal: 16, paddingTop: 4 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.line,
    overflow: "hidden",
    ...shadow.lift,
  },
  sheetFull: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  bar: { alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong },
  chevron: { position: "absolute", right: 8, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  chevronText: { fontSize: 18, color: colors.inkMute },
  header: { borderBottomWidth: 1, borderColor: colors.line },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  back: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 18, color: colors.ink },
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  footer: { borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12 },
});
