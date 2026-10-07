/**
 * A sheet over the current screen — the welcome screen's sign-in sheet,
 * wherever else one is needed: the map's look (rounded top, hairline, grabber)
 * and the panel reveal.
 *
 *  - The dimmed screen covers everything behind the sheet, rounded corners
 *    included, and fades with it; tapping it closes the sheet.
 *  - The sheet slides up every time it opens, and back down before the modal
 *    goes away.
 *  - It rides up with the keyboard (KeyboardLift), so nothing typed is hidden.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import KeyboardLift from "./KeyboardLift";
import PanelReveal from "./PanelReveal";
import { sheetChrome } from "./SignInSheet";
import { EASE, PANEL_CLOSE_MS, PANEL_OPEN_MS, useReduceMotion } from "@/lib/motion";

export default function OverlaySheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const still = useReduceMotion();
  // Up while open, and until the closing slide has finished.
  const [up, setUp] = useState(open);
  if (open && !up) setUp(true);

  const [dim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(dim, {
      toValue: open ? 1 : 0,
      duration: still ? 0 : open ? PANEL_OPEN_MS : PANEL_CLOSE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [open, still, dim]);

  return (
    <Modal visible={up} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: dim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardLift>
          <PanelReveal open={open} onClosed={() => setUp(false)}>
            <View style={[sheetChrome.panel, { paddingBottom: Math.max(24, insets.bottom + 8) }]}>
              <View style={sheetChrome.grabber} />
              {children}
            </View>
          </PanelReveal>
        </KeyboardLift>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(0,0,0,0.3)" },
});
