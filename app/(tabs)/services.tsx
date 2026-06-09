import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import Sortable, {
  type SortableGridDragEndParams,
  type SortableGridRenderItemInfo,
} from "react-native-sortables";
import { useRouter } from "expo-router";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useAttachedKinds, useActiveDashboard } from "@/hooks/use-active-dashboard";
import { useUiScale } from "@/hooks/use-ui-scale";
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
import type { ServiceId } from "@/lib/constants";
import { applyServicesOrder } from "@/lib/services-order";
import { SERVICE_ROUTES } from "@/lib/service-routes";
import type { HealthStatusKind } from "@/lib/types";

// Same dot palette as the dashboard service-health card — kept in sync so the
// user sees green/orange/red mean the same thing across surfaces.
const DOT_BG: Record<HealthStatusKind, string> = {
  ok: "bg-success",
  auth_failed: "bg-warning",
  offline: "bg-danger",
};

// Bottom breathing room below the last grid row. The tab-bar clearance itself
// is handled by ScreenWrapper (safe-area inset / floating glass tab-bar
// padding), so this is just spacing — not tab-bar compensation.
const LIST_BOTTOM_PADDING = 24;

export default function ServicesScreen() {
  const router = useRouter();
  const services = useConfigStore((s) => s.services);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const globalServicesOrder = useConfigStore((s) => s.servicesOrder);
  const setDashboardServicesOrder = useConfigStore(
    (s) => s.setDashboardServicesOrder,
  );
  const activeDashboard = useActiveDashboard();
  const attachedKinds = useAttachedKinds();
  const { data: health } = useServiceHealth();
  const uiScale = useUiScale();
  // Grid gap scales with the UI scale setting so spacing tracks the tiles.
  const tileGap = 12 * uiScale;
  // Animated ref to our own scroll view so Sortable.Grid can auto-scroll the
  // grid when a tile is dragged to the top/bottom edge.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // v30: tile order is per-workspace — each dashboard can arrange its Services
  // grid independently. Falls back to the global order when this dashboard has
  // no custom one, so existing setups are unchanged until the user reorders.
  const effectiveOrder = activeDashboard?.servicesOrder ?? globalServicesOrder;
  const fullOrder = useMemo(
    () => applyServicesOrder(effectiveOrder),
    [effectiveOrder],
  );
  // Workspace filter: only show enabled services with at least one attached
  // instance on the active dashboard. The full canonical order still drives
  // the reorder projection (so reordering visible tiles doesn't disturb
  // disabled/unattached services interleaved between them).
  const enabledServices = useMemo(
    () =>
      fullOrder.filter(
        (id) =>
          services[id].enabled &&
          SERVICE_ROUTES[id] &&
          attachedKinds.has(id),
      ),
    [fullOrder, services, attachedKinds],
  );

  // Project a reordered list of *visible* tiles back onto the full order,
  // preserving the positions of any disabled/unattached services interleaved
  // between them: walk the full order, and every slot occupied by a visible
  // service absorbs the next id from the new visible list, in order.
  const commitVisibleOrder = (nextVisible: ServiceId[]) => {
    const visibleSet = new Set(enabledServices);
    const nextFull = [...fullOrder];
    let cursor = 0;
    for (let i = 0; i < nextFull.length; i++) {
      if (visibleSet.has(nextFull[i])) {
        nextFull[i] = nextVisible[cursor++];
      }
    }
    // Persist onto the active dashboard so the rearrangement stays scoped to
    // this workspace and doesn't reshuffle the others.
    if (activeDashboard) setDashboardServicesOrder(activeDashboard.id, nextFull);
  };

  if (!enabledServices.length) {
    // Disambiguate: an install with zero enabled services needs Settings, but
    // a dashboard with services enabled-but-not-attached needs an edit on the
    // active dashboard. Detect by checking if any enabled service exists at
    // all (independent of attachment).
    const anyEnabledGlobally = fullOrder.some(
      (id) => services[id].enabled && SERVICE_ROUTES[id],
    );
    return (
      <ScreenWrapper scrollable={false}>
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Text className="text-zinc-100 text-lg font-semibold">
            {anyEnabledGlobally ? "Nothing attached here" : "No services enabled"}
          </Text>
          <Text className="text-zinc-500 text-sm text-center">
            {anyEnabledGlobally
              ? "Open the dashboard switcher and attach services to this workspace."
              : "Go to Settings to configure your services."}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  // A single-service install can't be rearranged — hide the drag hint.
  const canReorder = enabledServices.length > 1;

  const renderTile = ({ item: id }: SortableGridRenderItemInfo<ServiceId>) => {
    const service = services[id];
    const status = health?.find((h) => h.id === id);
    const healthStatus: HealthStatusKind = status?.status ?? "offline";
    const online = healthStatus !== "offline";
    // Surface WHY a tile isn't green (timeout, wrong key, off-WiFi LAN, …) so a
    // failing probe is never a silent red dot. First matching instance's
    // message.
    const detail =
      healthStatus !== "ok"
        ? status?.instances?.find((i) => i.status === healthStatus)?.message
        : undefined;

    // Tap opens the service; long-press starts a drag (handled by Sortable).
    // `w-full` makes the tile fill the grid cell Sortable sizes for it.
    return (
      <Pressable
        onPress={() => router.push(SERVICE_ROUTES[id]! as any)}
        className="w-full bg-surface border border-border rounded-2xl p-4 items-center gap-3 active:opacity-70"
      >
        <View className="relative">
          <View className="bg-surface-light rounded-xl p-3">
            <ServiceLogo id={id} size={28} online={online} />
          </View>
          <View
            className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${DOT_BG[healthStatus]}`}
          />
        </View>
        <Text className="text-zinc-100 text-sm font-medium">{service.name}</Text>
        {detail && (
          <Text
            className="text-zinc-500 text-[0.7rem] text-center"
            numberOfLines={2}
          >
            {detail}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <ScreenWrapper scrollable={false}>
      <View className="flex-row items-center justify-between mb-4 pt-2">
        <View className="flex-1 pr-3">
          <Text className="text-zinc-100 text-2xl font-bold">Services</Text>
          {canReorder && (
            <Text className="text-zinc-500 text-xs mt-0.5">
              Long-press a tile to reorder
            </Text>
          )}
        </View>
        {wolDevices.length > 0 && (
          <Pressable
            onPress={() => router.push("/wake-on-lan")}
            className="flex-row items-center gap-1.5 bg-surface border border-border rounded-xl px-3 py-2 active:opacity-70"
          >
            <Icon icon={Zap} size={14} color="#a1a1aa" />
            <Text className="text-zinc-300 text-sm">Wake</Text>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: LIST_BOTTOM_PADDING }}
      >
        <Sortable.Grid
          columns={2}
          data={enabledServices}
          keyExtractor={(id) => id}
          renderItem={renderTile}
          rowGap={tileGap}
          columnGap={tileGap}
          scrollableRef={scrollRef}
          activeItemScale={1.04}
          activeItemShadowOpacity={0.2}
          onDragStart={() => mediumHaptic()}
          onOrderChange={() => lightHaptic()}
          onDragEnd={({ data }: SortableGridDragEndParams<ServiceId>) =>
            commitVisibleOrder(data)
          }
        />
      </Animated.ScrollView>
    </ScreenWrapper>
  );
}
