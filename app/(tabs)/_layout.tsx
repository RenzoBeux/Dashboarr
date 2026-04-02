import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  Download,
  Film,
  Tv,
  Settings,
  Inbox,
  BarChart3,
  Search,
  PlayCircle,
} from "lucide-react-native";
import { useConfigStore } from "@/store/config-store";

const TAB_ICON_SIZE = 22;
const ACTIVE_COLOR = "#3b82f6";
const INACTIVE_COLOR = "#71717a";

export default function TabLayout() {
  const overseerrEnabled = useConfigStore((s) => s.services.overseerr.enabled);
  const tautulliEnabled = useConfigStore((s) => s.services.tautulli.enabled);
  const prowlarrEnabled = useConfigStore((s) => s.services.prowlarr.enabled);
  const plexEnabled = useConfigStore((s) => s.services.plex.enabled);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#18181b",
          borderTopColor: "#3f3f46",
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color }) => (
            <Download size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ color }) => (
            <Film size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tv"
        options={{
          title: "TV",
          tabBarIcon: ({ color }) => (
            <Tv size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Requests",
          tabBarIcon: ({ color }) => (
            <Inbox size={TAB_ICON_SIZE} color={color} />
          ),
          href: overseerrEnabled ? "/(tabs)/requests" : null,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color }) => (
            <BarChart3 size={TAB_ICON_SIZE} color={color} />
          ),
          href: tautulliEnabled ? "/(tabs)/activity" : null,
        }}
      />
      <Tabs.Screen
        name="indexers"
        options={{
          title: "Indexers",
          tabBarIcon: ({ color }) => (
            <Search size={TAB_ICON_SIZE} color={color} />
          ),
          href: prowlarrEnabled ? "/(tabs)/indexers" : null,
        }}
      />
      <Tabs.Screen
        name="plex"
        options={{
          title: "Plex",
          tabBarIcon: ({ color }) => (
            <PlayCircle size={TAB_ICON_SIZE} color={color} />
          ),
          href: plexEnabled ? "/(tabs)/plex" : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <Settings size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
