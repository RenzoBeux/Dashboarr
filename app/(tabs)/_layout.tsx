import { createElement, useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { Settings } from "lucide-react-native";
import { useBottomInset } from "@/hooks/use-bottom-inset";
import { lightHaptic } from "@/lib/haptics";
import { GlassSurface } from "@/components/ui/glass-surface";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";
import { useActiveDashboard, useAttachedKinds } from "@/hooks/use-active-dashboard";
import { resolveDashboardIcon } from "@/lib/dashboard-icons";
import { resolveDashboardColor } from "@/lib/dashboard-colors";
import { resolveTabIcon } from "@/lib/tab-icons";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  ALL_PICKABLE_TABS,
  visiblePinnedTabs,
  type TabRouteId,
} from "@/lib/tab-routes";

const TAB_ICON_SIZE = 24;
const INACTIVE_COLOR = "#71717a";

export default function TabLayout() {
  const bottom = useBottomInset();
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
  const theme = useAppTheme();

  // If the focused tab is no longer pinned (because the user switched to a
  // dashboard that doesn't include it, or unattached its underlying service),
  // jump back to the always-pinned Dashboard tab so the user never lands on a
  // hidden route with no way back.
  //
  // Trigger only on dashboard switch (or pin-set change), NOT on every
  // pathname change. Non-pinned tabs still have a registered route (so cards
  // / service tiles can deep-link into them via router.push) — if we redirect
  // on every pathname change, those deep links bounce back to /dashboard the
  // instant they land. The pathname is read inside the effect via a ref so
  // the latest value is used without the effect re-running when it changes.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  useEffect(() => {
    const current = pathnameRef.current;
    if (!current) return;
    const segment = current.split("/").filter(Boolean)[0];
    if (!segment) return;
    if (!ALL_PICKABLE_TABS.includes(segment as TabRouteId)) return;
    if (pinnedTabs.includes(segment as TabRouteId)) return;
    router.replace("/(tabs)/dashboard");
  }, [activeDashboard?.id, pinnedTabs.join(",")]);

  // Build the middle-tab declarations in pinned order, then fall back to the
  // canonical list for the rest. React Navigation renders tabs in the JSX
  // order they're declared — so to reflect the user's pin reorder controls in
  // the bar we have to declare pinned routes first. Tabs not in the pinned
  // set are still declared (so the route exists for deep-links from widget
  // cards) but with `href: null`, which hides them from the bar.
  const pinnedSet = new Set<TabRouteId>(pinnedTabs);
  const middleTabs: TabRouteId[] = [
    ...pinnedTabs,
    ...ALL_PICKABLE_TABS.filter((t) => !pinnedSet.has(t)),
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: HAS_GLASS_TAB_BAR ? "transparent" : theme.surface,
          borderTopColor: HAS_GLASS_TAB_BAR ? "transparent" : theme.border,
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

      {middleTabs.map((name) => {
        // Per-workspace icon override (v37, #195); falls back to the default.
        const IconComponent = resolveTabIcon(
          name,
          activeDashboard?.tabIcons?.[name],
        );
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
