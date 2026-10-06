/**
 * The website's primitives (.btn, .pill, Segmented, Stepper, inputs), drawn
 * natively. Mint fill means press this; everything else is a white button with
 * a line around it. Every control clears 44pt.
 */

import { forwardRef, type ReactNode } from "react";
import {
  ActionSheetIOS,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { GlassSurface } from "./Glass";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { colors, fonts, radius, size, type } from "@/lib/theme";

type Variant = "primary" | "quiet" | "dark" | "glass" | "glassDark";

export function Btn({
  label,
  children,
  onPress,
  variant = "quiet",
  large,
  small,
  icon,
  disabled,
  style,
  textStyle,
  accessibilityLabel,
}: {
  label?: string;
  children?: ReactNode;
  onPress: () => void;
  variant?: Variant;
  large?: boolean;
  small?: boolean;
  icon?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const shape = [
    styles.btn,
    large && styles.lg,
    small && styles.small,
    icon && styles.icon,
  ];
  const textColor = disabled
    ? colors.inkMute
    : variant === "dark" || variant === "glassDark"
      ? colors.onDark
      : colors.ink;
  const content =
    children ?? (
      <Text
        numberOfLines={1}
        style={[styles.label, small && { fontSize: size.caption }, { color: textColor }, textStyle]}
      >
        {label}
      </Text>
    );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      hitSlop={small ? 6 : 0}
      style={({ pressed }) => [pressed && !disabled && styles.pressed, style]}
    >
      {({ pressed }) =>
        variant === "glass" || variant === "glassDark" ? (
          <GlassSurface tone={variant === "glassDark" ? "dark" : "light"} interactive style={[shape, styles.round]}>
            {content}
          </GlassSurface>
        ) : (
          <View
            style={[
              shape,
              disabled
                ? styles.disabled
                : variant === "primary"
                  ? { backgroundColor: pressed ? colors.mintPress : colors.mint }
                  : variant === "dark"
                    ? { backgroundColor: pressed ? colors.inkSoft : colors.ink }
                    : styles.quiet,
            ]}
          >
            {content}
          </View>
        )
      }
    </Pressable>
  );
}

/** A choice you can take or leave, in a row of its like. Chosen is mint. */
export function Pill({ label, icon, on, onPress }: { label: string; icon?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}
    >
      {icon ? <Text style={styles.pillIcon}>{icon}</Text> : null}
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.eyebrow, style]}>{children}</Text>;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={[styles.segmentText, on && styles.segmentTextOn]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Stepper({
  label,
  value,
  atMin,
  atMax,
  onStep,
}: {
  label: string;
  value: string;
  atMin: boolean;
  atMax: boolean;
  onStep: (d: -1 | 1) => void;
}) {
  const step = (d: -1 | 1, disabled: boolean, glyph: string) => (
    <Pressable
      onPress={() => onStep(d)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${d < 0 ? "Less" : "More"} ${label.toLowerCase()}`}
      style={({ pressed }) => [styles.stepBtn, disabled && styles.stepBtnOff, pressed && styles.pressed]}
    >
      <Text style={[styles.stepGlyph, disabled && { color: colors.lineStrong }]}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={[styles.track, styles.stepTrack]}>
        {step(-1, atMin, "−")}
        <Text numberOfLines={1} style={styles.stepValue}>
          {value}
        </Text>
        {step(1, atMax, "+")}
      </View>
    </View>
  );
}

export const Field = forwardRef<TextInput, TextInputProps>(function Field({ style, ...props }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.inkMute}
      style={[styles.field, style]}
      {...props}
    />
  );
});

/** An underlined text action, as the website's "Clear all", "Cancel". */
export function TextLink({
  label,
  onPress,
  muted,
  style,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={[styles.textLink, style]}>
      <Text style={[type.link, muted && { color: colors.inkMute, fontSize: size.caption }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  round: { borderRadius: radius.pill, overflow: "hidden" },
  lg: { minHeight: 50, paddingVertical: 14, paddingHorizontal: 20 },
  small: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 12 },
  icon: { width: 48, minWidth: 48, paddingHorizontal: 0 },
  label: { fontFamily: fonts.displayMedium, fontSize: size.body, lineHeight: size.body * 1.2 },
  quiet: { backgroundColor: colors.surface, borderColor: colors.lineStrong },
  disabled: { backgroundColor: colors.line },
  pressed: { transform: [{ scale: 0.975 }] },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  pillIcon: { fontSize: size.body },
  pillText: { fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.inkSoft },
  pillTextOn: { fontFamily: fonts.display, color: colors.ink },

  track: {
    marginTop: 8,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentOn: { backgroundColor: colors.mint },
  segmentText: { fontFamily: fonts.displayMedium, fontSize: size.caption, color: colors.inkSoft },
  segmentTextOn: { fontFamily: fonts.display, color: colors.ink },

  stepTrack: { alignItems: "center", justifyContent: "space-between" },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnOff: { borderColor: colors.line, backgroundColor: "transparent" },
  stepGlyph: { fontFamily: fonts.display, fontSize: size.lead, color: colors.ink, lineHeight: size.lead * 1.1 },
  stepValue: { flex: 1, textAlign: "center", fontFamily: fonts.display, fontSize: size.lead, color: colors.ink },

  field: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: size.body,
    color: colors.ink,
  },
  textLink: { minHeight: 44, justifyContent: "center", alignSelf: "center" },
});

/** The website's language <select>: a row with a label, opening iOS's own picker. */
export function LanguageSelect({ value, onChange, label }: { value: string; onChange: (code: string) => void; label: string }) {
  const current = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0];
  const open = () => {
    if (Platform.OS !== "ios") return;
    ActionSheetIOS.showActionSheetWithOptions(
      { title: label, options: [...LANGUAGES.map(languageLabel), "Cancel"], cancelButtonIndex: LANGUAGES.length },
      (i) => {
        if (i < LANGUAGES.length) onChange(LANGUAGES[i].code);
      },
    );
  };
  return (
    <View style={selectStyles.langRow}>
      <Eyebrow>{label}</Eyebrow>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${current.english}`} style={selectStyles.select}>
        <Text numberOfLines={1} style={selectStyles.selectText}>
          {languageLabel(current)}
        </Text>
        <Text style={selectStyles.selectCaret}>⌄</Text>
      </Pressable>
    </View>
  );
}

const selectStyles = StyleSheet.create({
  langRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  select: {
    maxWidth: "62%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  selectText: { flexShrink: 1, fontFamily: fonts.body, fontSize: size.body, color: colors.ink },
  selectCaret: { fontSize: 16, color: colors.inkMute, marginTop: -6 },
});
