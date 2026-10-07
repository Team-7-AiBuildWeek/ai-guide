/**
 * Lifts what it holds (a bottom sheet) by exactly the keyboard's height, in
 * step with the keyboard's own animation, so the field being typed in and the
 * button under it stay above the keys. The home-indicator gap the sheet keeps
 * at the bottom is taken back while the keyboard is up, since the keyboard now
 * fills it.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Keyboard, Platform, type KeyboardEvent, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** iOS's own keyboard curve, near enough. */
const KEYBOARD_EASE = Easing.bezier(0.17, 0.59, 0.4, 0.77);

export default function KeyboardLift({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [lift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const move = (to: number, e?: KeyboardEvent) =>
      Animated.timing(lift, {
        toValue: to,
        duration: e?.duration || 250,
        easing: KEYBOARD_EASE,
        useNativeDriver: true,
      }).start();
    const subs = [
      Keyboard.addListener(show, (e) => move(Math.max(0, e.endCoordinates.height - insets.bottom), e)),
      Keyboard.addListener(hide, (e) => move(0, e)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [lift, insets.bottom]);

  // box-none: the wrapper itself never takes a touch, so a closed sheet
  // inside it does not sit over the buttons behind it.
  return (
    <Animated.View pointerEvents="box-none" style={[style, { transform: [{ translateY: Animated.multiply(lift, -1) }] }]}>
      {children}
    </Animated.View>
  );
}
