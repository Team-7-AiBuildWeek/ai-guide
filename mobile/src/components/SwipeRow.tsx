/**
 * A row you swipe to reveal its actions — the website's SwipeRow (after React
 * Bits), drawn natively.
 *
 * Swipe left a little and the drawer opens on the actions; past `commitAt`
 * of the row's width the first action's block leaps across the row (with a
 * haptic tap) and letting go commits it: the row slides off, folds shut, and
 * then `onCommit` runs. Past the drawer the row pulls with resistance, a
 * flick settles with a spring, and a tap on the row closes an open drawer.
 *
 * Only a mostly-horizontal drag takes the gesture, so the list still scrolls.
 */

import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { EASE, useReduceMotion } from "@/lib/motion";
import { colors, fonts, radius as radii } from "@/lib/theme";

export type SwipeAction = {
  id: string;
  label: string;
  /** An SF Symbol name. */
  symbol?: string;
  /** Background for a secondary action; the first uses `actionColor`. */
  color?: string;
  onSelect?: () => void;
};

const HYST = 10;
const FLICK = 0.35; // points per millisecond
const COLLAPSE_MS = 200;

const rubber = (o: number, dim: number, c: number) => (o * dim * c) / (dim + c * Math.abs(o));

export default function SwipeRow({
  children,
  actions,
  actionColor = colors.danger,
  drawerColor = colors.mint,
  actionWidth = 80,
  commitAt = 0.45,
  resistance = 0.7,
  radius = radii.card,
  onCommit,
}: {
  children: ReactNode;
  /** The drawer, outermost first. The first is the full-swipe action. */
  actions: SwipeAction[];
  actionColor?: string;
  drawerColor?: string;
  actionWidth?: number;
  commitAt?: number;
  resistance?: number;
  radius?: number;
  /** After a full swipe or a press on the first action, once the row has folded. Remove the row here. */
  onCommit?: (a: SwipeAction) => void;
}) {
  // The gesture handler is made once, so what it reads must be current.
  const reduceMotion = useReduceMotion();
  const stillRef = useRef(reduceMotion);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    stillRef.current = reduceMotion;
    onCommitRef.current = onCommit;
  });
  const A = actionWidth;
  const n = actions.length;
  const D = n * A;
  const primary = actions[0];

  const width = useRef(360);
  const height = useRef(0);
  const [x] = useState(() => new Animated.Value(0)); // how far the drawer is uncovered, in points
  const [spread] = useState(() => new Animated.Value(0)); // 1 once the block has leapt
  const [fold] = useState(() => new Animated.Value(1)); // 1 standing, 0 folded shut
  /** The height the row folds from, once it starts folding. */
  const [foldFrom, setFoldFrom] = useState<number | null>(null);
  const opened = useRef(0);
  const leapt = useRef(false);
  const busy = useRef(false);

  const commitPoint = () => Math.max(commitAt * width.current, D + A / 2);
  const map = (raw: number) => {
    const W = width.current;
    if (raw < 0) return rubber(raw, W, resistance);
    if (raw <= D) return raw;
    const C = commitPoint();
    const knee = D + (C - D) / resistance;
    return raw <= knee ? D + resistance * (raw - D) : C + rubber(raw - knee, W, resistance);
  };

  const settle = (to: number, velocity = 0) => {
    opened.current = to;
    if (stillRef.current)
      Animated.timing(x, {
        toValue: to,
        duration: 150,
        useNativeDriver: false,
      }).start();
    else
      Animated.spring(x, {
        toValue: to,
        velocity,
        bounciness: Math.abs(velocity) > FLICK ? 6 : 0,
        speed: 16,
        useNativeDriver: false,
      }).start();
  };
  const setSpread = (on: boolean) => {
    if (leapt.current === on) return;
    leapt.current = on;
    Animated.timing(spread, {
      toValue: on ? 1 : 0,
      duration: stillRef.current ? 0 : 180,
      easing: EASE,
      useNativeDriver: false,
    }).start();
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const commit = (a: SwipeAction) => {
    if (busy.current) return;
    busy.current = true;
    if (a === primary) setSpread(true);
    Animated.timing(x, {
      toValue: width.current,
      duration: stillRef.current ? 0 : 200,
      easing: EASE,
      useNativeDriver: false,
    }).start(() => {
      setFoldFrom(height.current);
      Animated.timing(fold, {
        toValue: 0,
        duration: stillRef.current ? 0 : COLLAPSE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        onCommitRef.current?.(a);
        a.onSelect?.();
      });
    });
  };

  const start = useRef(0);
  // The refs below are read inside the gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !busy.current && Math.abs(g.dx) > HYST && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        x.stopAnimation((v) => (start.current = v));
      },
      onPanResponderMove: (_, g) => {
        const ex = map(start.current - g.dx);
        x.setValue(ex);
        setSpread(ex >= commitPoint());
      },
      onPanResponderRelease: (_, g) => {
        const ex = start.current - g.dx;
        const shown = map(ex);
        if (primary && shown >= commitPoint()) {
          commit(primary);
          return;
        }
        setSpread(false);
        const v = -g.vx;
        const to = Math.abs(v) > FLICK ? (v > 0 ? D : 0) : shown > D / 2 ? D : 0;
        settle(to, v);
      },
      onPanResponderTerminate: () => {
        setSpread(false);
        settle(opened.current);
      },
    }),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
    if (foldFrom === null) height.current = e.nativeEvent.layout.height;
  };

  // The drawer slides in from the right edge as the row uncovers it.
  const railX = x.interpolate({
    inputRange: [0, D],
    outputRange: [D, 0],
    extrapolate: "clamp",
  });
  // The block grows from one action wide to everything uncovered once it has leapt.
  const pastFirst = x.interpolate({
    inputRange: [A, A + 1],
    outputRange: [0, 1],
    extrapolateLeft: "clamp",
    extrapolateRight: "extend",
  });
  const blockWidth = Animated.add(A, Animated.multiply(spread, pastFirst));

  return (
    <Animated.View
      onLayout={onLayout}
      style={
        foldFrom !== null
          ? {
              height: fold.interpolate({
                inputRange: [0, 1],
                outputRange: [0, foldFrom ?? 0],
              }),
              opacity: fold,
              overflow: "hidden",
            }
          : undefined
      }
    >
      <View style={[styles.clip, { borderRadius: radius }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: drawerColor,
              transform: [{ translateX: railX }],
            },
          ]}
        >
          {actions.slice(1).map((a, i) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                a.onSelect?.();
                settle(0);
              }}
              style={[
                styles.action,
                {
                  right: (i + 1) * A,
                  width: A,
                  backgroundColor: a.color ?? drawerColor,
                },
              ]}
            >
              <Glyph action={a} tint={colors.ink} />
            </Pressable>
          ))}
          {primary ? (
            <Animated.View style={[styles.block, { width: blockWidth, backgroundColor: actionColor }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={primary.label}
                onPress={() => commit(primary)}
                style={[styles.action, { left: 0, width: A }]}
              >
                <Glyph action={primary} tint="#fff" />
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.surface,
            {
              transform: [{ translateX: Animated.multiply(x, -1) }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function Glyph({ action, tint }: { action: SwipeAction; tint: string }) {
  return (
    <View style={styles.glyph}>
      {action.symbol ? <SymbolView name={action.symbol as never} size={20} tintColor={tint} fallback={null} /> : null}
      <Text style={[styles.label, { color: tint }]}>{action.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  surface: { backgroundColor: colors.surface },
  action: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { position: "absolute", top: 0, bottom: 0, right: 0 },
  glyph: { alignItems: "center", gap: 4 },
  label: { fontFamily: fonts.display, fontSize: 12 },
});
