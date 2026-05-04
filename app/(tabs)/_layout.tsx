import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { LayoutDashboard, Download, CalendarDays, LayoutGrid, Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightHaptic } from "@/lib/haptics";
import { GlassSurface } from "@/components/ui/glass-surface";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";

const TAB_ICON_SIZE = 24;
const ACTIVE_COLOR = "#3b82f6";
const INACTIVE_COLOR = "#71717a";

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: HAS_GLASS_TAB_BAR ? "transparent" : "#18181b",
          borderTopColor: HAS_GLASS_TAB_BAR ? "transparent" : "#3f3f46",
          borderTopWidth: HAS_GLASS_TAB_BAR ? 0 : 0.5,
          height: 52 + bottom,
          paddingBottom: 4 + bottom,
          paddingTop: 6,
          position: HAS_GLASS_TAB_BAR ? "absolute" : undefined,
        },
        tabBarBackground: HAS_GLASS_TAB_BAR
          ? () => <GlassSurface style={StyleSheet.absoluteFill} />
          : undefined,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="movies" options={{ href: null }} />
      <Tabs.Screen name="tv" options={{ href: null }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="indexers" options={{ href: null }} />
      <Tabs.Screen name="plex" options={{ href: null }} />
      <Tabs.Screen name="glances" options={{ href: null }} />
      <Tabs.Screen name="bazarr" options={{ href: null }} />
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={TAB_ICON_SIZE} color={color} />
          ),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          tabBarIcon: ({ color }) => (
            <Download size={TAB_ICON_SIZE} color={color} />
          ),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarIcon: ({ color }) => (
            <CalendarDays size={TAB_ICON_SIZE} color={color} />
          ),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tabs.Screen
        name="services"
        options={{
          tabBarIcon: ({ color }) => (
            <LayoutGrid size={TAB_ICON_SIZE} color={color} />
          ),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => (
            <Settings size={TAB_ICON_SIZE} color={color} />
          ),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
    </Tabs>
  );
}
