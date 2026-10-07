/**
 * A sheet over the current screen — the welcome screen's sign-in sheet,
 * wherever else one is needed: the map's look (rounded top, hairline, grabber)
 * and the panel reveal. The modal stays up until the sheet has finished
 * sliding away; tapping the dimmed screen behind it closes it.
 */

import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelReveal from "./PanelReveal";
import { sheetChrome } from "./SignInSheet";

export default function OverlaySheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  // Up while open, and until the closing slide has finished.
  const [up, setUp] = useState(open);
  if (open && !up) setUp(true);

  return (
    <Modal visible={up} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, !open && { opacity: 0 }]} onPress={onClose} accessibilityLabel="Close" />
      <PanelReveal open={open} onClosed={() => setUp(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[sheetChrome.panel, { paddingBottom: Math.max(24, insets.bottom + 8) }]}>
            <View style={sheetChrome.grabber} />
            {children}
          </View>
        </KeyboardAvoidingView>
      </PanelReveal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
});
