import { Tabs } from "expo-router";
import { LayoutDashboard, Download, LayoutGrid, Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
          backgroundColor: "#18181b",
          borderTopColor: "#3f3f46",
          borderTopWidth: 0.5,
          height: 52 + bottom,
          paddingBottom: 4 + bottom,
          paddingTop: 6,
        },
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
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          tabBarIcon: ({ color }) => (
            <Download size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          tabBarIcon: ({ color }) => (
            <LayoutGrid size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => (
            <Settings size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
