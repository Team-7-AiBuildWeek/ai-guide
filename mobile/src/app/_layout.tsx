import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.mint,
          headerTitleStyle: { color: colors.ink },
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Walk" }} />
        <Stack.Screen name="tour/[id]" options={{ title: "Tour" }} />
        <Stack.Screen name="walk/[id]" options={{ title: "Walking", headerBackTitle: "Tour" }} />
      </Stack>
    </>
  );
}
