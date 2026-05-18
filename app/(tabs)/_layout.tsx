import { createElement, useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import {
  Activity,
  CalendarDays,
  Captions,
  Clapperboard,
  Cpu,
  Download,
  Film,
  Inbox,
  LayoutGrid,
  PlayCircle,
  Radar,
  Settings,
  Tv,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightHaptic } from "@/lib/haptics";
import { GlassSurface } from "@/components/ui/glass-surface";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";
import { useActiveDashboard, useAttachedKinds } from "@/hooks/use-active-dashboard";
import { resolveDashboardIcon } from "@/lib/dashboard-icons";
import { resolveDashboardColor } from "@/lib/dashboard-colors";
import {
  ALL_PICKABLE_TABS,
  visiblePinnedTabs,
  type TabRouteId,
} from "@/lib/tab-routes";

const TAB_ICON_SIZE = 24;
const INACTIVE_COLOR = "#71717a";

// Static icon map for the user-pickable middle tabs. Lives outside the
// component so the layout doesn't re-create the lookup on every render.
const TAB_ICONS: Record<TabRouteId, LucideIcon> = {
  downloads: Download,
  calendar: CalendarDays,
  services: LayoutGrid,
  movies: Film,
  tv: Tv,
  requests: Inbox,
  activity: Activity,
  indexers: Radar,
  plex: PlayCircle,
  jellyfin: Clapperboard,
  glances: Cpu,
  bazarr: Captions,
};

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  // The (tabs) group doesn't appear in the URL, so pathname looks like
  // "/movies" or "/dashboard" — the first path segment is the route name.
  const pathname = usePathname();
  const activeDashboard = useActiveDashboard();
  const attachedKinds = useAttachedKinds();

  // Visible pinned tabs: stored pins intersected with what's pickable given
  // the kinds with any attached instance. Dead pins (kinds whose instances
  // got un-attached) survive in storage; this filter just hides them at
  // render time so re-attaching restores the pin without re-picking.
  const storedPins = activeDashboard?.pinnedTabs ?? [];
  const pinnedTabs = useMemo(
    () => visiblePinnedTabs(storedPins, attachedKinds),
    [storedPins.join(","), attachedKinds],
  );

  const dashIcon = resolveDashboardIcon(activeDashboard?.icon);
  const accent = resolveDashboardColor(activeDashboard?.color);

  // If the focused tab is no longer pinned (because the user switched to a
  // dashboard that doesn't include it, or unattached its underlying service),
  // jump back to the always-pinned Dashboard tab so the user never lands on a
  // hidden route with no way back.
  //
  // Critical gating: only act when the current segment is a known
  // pickable tab. The (tabs) layout stays mounted when the user pushes to a
  // non-tabs route (e.g. /dashboard-edit/[id]), and its pathname changes
  // accordingly — without this guard the effect would bounce the user back
  // to /dashboard whenever they navigate to any sibling route.
  useEffect(() => {
    if (!pathname) return;
    const segment = pathname.split("/").filter(Boolean)[0];
    if (!segment) return;
    if (!ALL_PICKABLE_TABS.includes(segment as TabRouteId)) return;
    if (pinnedTabs.includes(segment as TabRouteId)) return;
    router.replace("/(tabs)/dashboard");
  }, [activeDashboard?.id, pinnedTabs, pathname]);

  // Build the middle-tab declarations in the order pinned. React Navigation
  // renders tabs in the JSX order they're declared, so this is what makes the
  // bar visually reflect pin order. Tabs not in the pinned set are still
  // declared (so the route exists for deep-links from widget cards) but with
  // `href: null`, which hides them from the bar.
  const pinnedSet = new Set<TabRouteId>(pinnedTabs);

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
        // Active tint mirrors the active dashboard's accent so the whole
        // bottom bar reads as the current workspace. Switching dashboards
        // recolors every tab's active state, making the workspace identity
        // visible regardless of which tab the user is on.
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />

      <Tabs.Screen
        name="dashboard"
        options={{
          // Raw lucide component (not the scaling <Icon> wrapper) — the tab
          // bar is deliberately excluded from UI scale per CLAUDE.md.
          tabBarIcon: ({ color }) =>
            createElement(dashIcon, { size: TAB_ICON_SIZE, color }),
        }}
        listeners={{ tabPress: () => lightHaptic() }}
      />

      {ALL_PICKABLE_TABS.map((name) => {
        const IconComponent = TAB_ICONS[name];
        const visible = pinnedSet.has(name);
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              href: visible ? undefined : null,
              tabBarIcon: ({ color }) => (
                <IconComponent size={TAB_ICON_SIZE} color={color} />
              ),
            }}
            listeners={{ tabPress: () => lightHaptic() }}
          />
        );
      })}

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
