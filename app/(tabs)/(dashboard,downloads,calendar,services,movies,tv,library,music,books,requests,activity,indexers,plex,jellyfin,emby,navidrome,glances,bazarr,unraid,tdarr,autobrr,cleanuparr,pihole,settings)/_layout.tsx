import { AppStack } from "@/components/navigation/app-stack";
import { useStackScreenOptions } from "@/hooks/use-stack-screen-options";
import { ALL_TAB_ROUTE_ID_SET, TAB_STACK_ANCHORS } from "@/lib/tab-routes";

/**
 * One native stack per tab (#330). This array-group directory lists every tab
 * id, so expo-router mounts a separate instance of this layout for each
 * `(<id>)` group: the tab's root screen is `(<id>)/<id>.tsx` and nested
 * screens push inside the tab, which keeps the bottom bar visible and each
 * tab's position intact when switching tabs.
 *
 * Where a screen lives:
 *   - shared by several tabs: an array group listing exactly those tabs, e.g.
 *     (dashboard,downloads,calendar,movies,tv,library,music,books)/series/[id].tsx
 *   - reachable from one tab only: that tab's own dir, e.g. (pihole)/pihole/queries.tsx
 *   - never a _layout.tsx inside a single (<id>)/ dir: it would conflict with this one
 *   - full-screen editors that change the tab bar itself (dashboard-edit) stay
 *     on the root stack
 * A tab must be listed in the array group of every screen it pushes to;
 * otherwise the push resolves to another tab's copy of that screen and
 * switches tabs. lib/tab-route-tree.test.ts and
 * lib/tab-route-resolution.test.ts guard the file tree and the resolution.
 *
 * `unstable_settings` anchors each group's stack on its tab root (keys are
 * the group names without parentheses). Notifications and OS deep links to
 * content details are pinned to the Dashboard stack (DASHBOARD_STACK_PREFIX).
 */
export const unstable_settings = TAB_STACK_ANCHORS;

export default function TabStackLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <AppStack popToRootNames={ALL_TAB_ROUTE_ID_SET} screenOptions={screenOptions} />
  );
}
