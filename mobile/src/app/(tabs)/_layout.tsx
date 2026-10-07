/**
 * Explore, Tours, Account — the same three tabs as the website — behind the
 * front door: nobody reaches them without passing the welcome screen. Signed
 * in, straight in; signed out, the welcome screen every time the app opens
 * ("Continue without an account" there lets them in — Apple does not allow
 * an app to demand an account its features do not need); without accounts,
 * once.
 *
 * Laid out like Airbnb's bar: white, a hairline on top, an icon over each
 * label, the tab you are on in the one green that may be text. Explore hides
 * it while a tour is being built or walked (its tabBarStyle option, read
 * below), so the map has the whole screen.
 */

import { useAuth } from "@clerk/expo";
import { Redirect, Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accountsEnabled } from "@/lib/accounts";
import { welcomed } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

/** What Expo Router hands a custom tab bar. */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ICONS: Record<string, { label: string; ios: string; on: string; glyph: string }> = {
  index: { label: "Explore", ios: "map", on: "map.fill", glyph: "🗺" },
  tours: { label: "Tours", ios: "point.topleft.down.to.point.bottomright.curvepath", on: "point.topleft.down.to.point.bottomright.curvepath.fill", glyph: "🚶" },
  account: { label: "Account", ios: "person.crop.circle", on: "person.crop.circle.fill", glyph: "👤" },
};

function TabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focused = descriptors[state.routes[state.index].key]?.options;
  if ((focused?.tabBarStyle as { display?: string } | undefined)?.display === "none") return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const tab = ICONS[route.name];
        if (!tab) return null;
        const on = state.index === i;
        const color = on ? colors.mintInk : colors.inkMute;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!on && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}
          >
            <SymbolView
              name={{ ios: on ? tab.on : tab.ios, android: "circle", web: "circle" } as never}
              size={26}
              tintColor={color}
              fallback={<Text style={{ fontSize: 22 }}>{tab.glyph}</Text>}
            />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return accountsEnabled ? <WithAccounts /> : welcomed() ? <TabsNavigator /> : <Redirect href="/welcome" />;
}

function WithAccounts() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null; // the splash is still up
  return isSignedIn || welcomed() ? <TabsNavigator /> : <Redirect href="/welcome" />;
}

function TabsNavigator() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tours" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 48, justifyContent: "center" },
  label: { fontFamily: fonts.displayMedium, fontSize: 12 },
});
