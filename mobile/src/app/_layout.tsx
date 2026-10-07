import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import Splash from "@/components/Splash";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/accounts";
import { colors } from "@/lib/theme";

// The system's still splash stays up until the animated one is on screen.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** The website's pairing: Space Grotesk for display, Inter for reading. */
export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [splashing, setSplashing] = useState(true);

  const app = (
    <>
      {/* Edge to edge, like the website's installed app: every screen draws its own top. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" options={{ animation: "fade" }} />
        <Stack.Screen name="profile" />
      </Stack>
    </>
  );
  const shell = (
    <View style={{ flex: 1, backgroundColor: colors.dark }}>
      {/* Light over the dark splash, dark over the app. */}
      <StatusBar style={splashing ? "light" : "dark"} />
      {/* Nothing is drawn under the splash until the fonts are in, so no screen flashes in system type. */}
      {loaded ? app : null}
      {splashing ? <Splash ready={loaded} onDone={() => setSplashing(false)} /> : null}
    </View>
  );
  // Accounts are optional: without Clerk's key the app runs exactly as before.
  return CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      {shell}
    </ClerkProvider>
  ) : (
    shell
  );
}
