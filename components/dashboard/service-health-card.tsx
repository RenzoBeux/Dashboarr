import { View, Text, Pressable } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo, hasServiceLogo } from "@/components/ui/service-logo";
import { Spinner } from "@/components/ui/spinner";
import { StatusDot } from "@/components/ui/status-dot";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { ICON, type ServiceId } from "@/lib/constants";
import { applyServicesOrder } from "@/lib/services-order";
import { SERVICE_ROUTES } from "@/lib/service-routes";
import { resolveActiveUrlKind, isRemoteOnlyOffline } from "@/lib/url-validation";
import { useConfigStore } from "@/store/config-store";
import { useAttachedInstances, useActiveDashboard } from "@/hooks/use-active-dashboard";
import {
  resolveBoundInstances,
  isExplicitInstanceBinding,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  SERVICE_HEALTH_DEFAULT_SETTINGS,
  type ServiceHealthSettingsValue,
} from "@/components/dashboard/widget-settings/service-health-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { HealthStatusKind, ServiceInstanceHealthStatus } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

// Matches the spring used by the Services tab and the Status widget's
// settings sheet — so when the user reorders kinds, the dashboard tile
// rearrangement feels continuous with the surface they touched.
const REORDER_LAYOUT = LinearTransition.springify().damping(18).stiffness(180).mass(0.7);

// One indicator per (kind, instance) pair after applying the slot's binding
// settings. The card always renders one tile per bound instance — the prior
// behavior of showing a single aggregated icon per kind was wrong when one of
// two qBittorrents was offline (the kind would still flash green).
interface RenderEntry {
  kindId: ServiceId;
  instanceId: string;
  label: string;
  status: HealthStatusKind;
  // Which URL this instance is actively using ("local"/"remote"), or null when
  // neither is configured. Drives the L/R corner badge (#148).
  urlKind: "local" | "remote" | null;
  // True when this instance is offline purely because the app is remote-only
  // (away from home / workspace pinned remote) but has no remote URL set — the
  // #168 case. Drives the away badge, which takes the L/R badge's corner.
  awayBlocked: boolean;
  // True while the health batch is still settling and we have no verdict yet
  // for this instance — render the dot as "checking" instead of red (#196).
  checking: boolean;
}

// L/R corner badge palette — deliberately hues NOT used by the status dot
// (green/amber/red) so the two corners read as different signals at a glance.
const URL_KIND_BG: Record<"local" | "remote", string> = {
  local: "bg-sky-500",
  remote: "bg-violet-500",
};

export function ServiceHealthCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<ServiceHealthSettingsValue>(
    slotId,
    SERVICE_HEALTH_DEFAULT_SETTINGS,
  );
  const { data: services, isPending, isPlaceholderData } = useServiceHealth();
  // "Determining": either the first-ever probe batch (no data yet) or a re-keyed
  // refetch in flight after a network/dashboard change (keepPreviousData keeps
  // the stale verdict visible, flagged by isPlaceholderData). A routine 30s
  // background poll is neither, so the spinner doesn't blink every interval.
  const determining = isPending || isPlaceholderData;
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const servicesOrder = useConfigStore((s) => s.servicesOrder);
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  // Subscribed so the L/R badge flips live when the user walks home/away or
  // toggles auto-switch — both feed resolveActiveUrlKind below.
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const networkAwayFromHome = useConfigStore((s) => s.networkAwayFromHome);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const attachedInstances = useAttachedInstances();
  const activeDashboard = useActiveDashboard();
  const router = useRouter();

  // A workspace that explicitly selected no live home networks (homeNetworkIds:
  // [] or only stale ids) is "always remote" — mirror getActiveUrl step 2 so the
  // L/R badge reads "remote" even when global auto-switch is off (#148).
  const workspaceForcesRemote = (() => {
    const ids = activeDashboard?.homeNetworkIds;
    if (!Array.isArray(ids)) return false;
    return !ids.some((id) => homeNetworks.some((n) => n.id === id));
  })();

  const hiddenSet = new Set(settings.hiddenKinds);
  // Index health by (kind, instanceId) so we can pair each bound instance with
  // its live status. The hook already pings every configured instance, so this
  // is a pure lookup — no extra requests.
  const healthByInstance = new Map<string, ServiceInstanceHealthStatus>();
  for (const kind of services ?? []) {
    for (const inst of kind.instances) {
      healthByInstance.set(`${kind.id}:${inst.instanceId}`, inst);
    }
  }

  const entries: RenderEntry[] = [];
  // Honor the user-defined kind order (shared with the Services tab via
  // store.servicesOrder). Kinds the user hasn't touched fall in at the end in
  // canonical SERVICE_IDS order via applyServicesOrder.
  for (const kindId of applyServicesOrder(servicesOrder)) {
    if (!hasServiceLogo(kindId)) continue;
    if (hiddenSet.has(kindId)) continue;
    const allInstances = (serviceInstances[kindId] ?? []).filter(
      (i: ServiceInstance) => i.enabled,
    );
    if (allInstances.length === 0) continue;
    const binding = settings.instances[kindId];
    const resolved = resolveBoundInstances(binding, allInstances);
    // Workspace filter at per-instance granularity, but ONLY for the default
    // "all" aggregate: the user attached specific instances to this dashboard
    // (e.g. "Radarr Home" but not "Radarr Cabin"), so a widget bound to "all"
    // drops instances that aren't attached — that keeps the Cabin Radarr's
    // offline status off the Home dashboard's health grid.
    //
    // When the user has *explicitly* picked instances in this widget's
    // settings, honor that selection as-is. The picker lists every enabled
    // instance of the kind, so the user can select one that isn't attached to
    // the active workspace and expects it to show; the explicit per-widget
    // pick is a deliberate choice that wins over the workspace default.
    // Without this, an instance shown as selectable + selected in the widget
    // settings was silently hidden — that was the second half of #106.
    const bound = isExplicitInstanceBinding(binding)
      ? resolved
      : resolved.filter((inst) => attachedInstances.has(inst.id));
    if (bound.length === 0) continue;
    for (const inst of bound) {
      const health = healthByInstance.get(`${kindId}:${inst.id}`);
      const awayBlocked = isRemoteOnlyOffline(
        inst,
        autoSwitchNetwork,
        networkAwayFromHome,
        workspaceForcesRemote,
      );
      entries.push({
        kindId,
        instanceId: inst.id,
        // Always use the instance's own name so users with two qBittorrents
        // ("qBit Home" / "qBit Cabin") can tell which one is offline at a
        // glance instead of seeing two identical "qBittorrent" tiles.
        label: inst.name,
        status: health?.status ?? "offline",
        urlKind: resolveActiveUrlKind(
          inst,
          autoSwitchNetwork,
          networkAwayFromHome,
          workspaceForcesRemote,
        ),
        awayBlocked,
        // Away-blocked instances are deterministically offline-by-config (no
        // remote URL while remote-only), so they keep their red dot + away
        // badge rather than a misleading "checking" pulse.
        checking: determining && !health && !awayBlocked,
      });
    }
  }

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <CardTitle>Services</CardTitle>
          {determining ? <Spinner size={14} color="#71717a" /> : null}
        </View>
      </CardHeader>
      <View className="flex-row flex-wrap gap-4">
        {entries.map((entry) => {
          const route = SERVICE_ROUTES[entry.kindId];

          return (
            <Animated.View
              key={`${entry.kindId}:${entry.instanceId}`}
              layout={REORDER_LAYOUT}
            >
            <Pressable
              onPress={() => {
                // Offline purely because we're remote-only with no remote URL
                // (#168) — send the user to Home Networks, where they can
                // confirm home / grant Location, instead of a service screen
                // that can't load while away.
                if (entry.awayBlocked) {
                  router.push("/home-networks");
                  return;
                }
                if (!route) return;
                // Switch the active instance to the one tapped so the
                // destination tab opens against this server, not whichever
                // instance the user happened to last visit.
                setActiveInstance(entry.kindId, entry.instanceId);
                router.push(route as any);
              }}
              className="items-center gap-1.5 active:opacity-70"
              hitSlop={6}
            >
              <View className="relative">
                <View className="bg-surface-light rounded-xl p-2.5">
                  <ServiceLogo
                    id={entry.kindId}
                    size={ICON.LG}
                    online={entry.status !== "offline"}
                  />
                </View>
                {settings.showAwayBadge && entry.awayBlocked ? (
                  // Offline because we're remote-only with no remote URL (#168).
                  // Takes the L/R corner and supersedes it — resolveActiveUrlKind
                  // would otherwise read "R" here, which is misleading since no
                  // remote URL exists. Amber signals "network state", distinct
                  // from the red offline dot in the opposite corner.
                  <View className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full border-2 border-surface items-center justify-center bg-amber-500">
                    <Icon icon={WifiOff} size={9} color="#fff" />
                  </View>
                ) : settings.showUrlBadge && entry.urlKind ? (
                  <View
                    className={`absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full border-2 border-surface items-center justify-center ${URL_KIND_BG[entry.urlKind]}`}
                  >
                    <Text className="text-white text-[0.6rem] font-bold leading-none">
                      {entry.urlKind === "local" ? "L" : "R"}
                    </Text>
                  </View>
                ) : null}
                <StatusDot
                  state={entry.checking ? "checking" : entry.status}
                  overlay
                  shadow
                />
              </View>
              <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                {entry.label}
              </Text>
            </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </Card>
  );
}
