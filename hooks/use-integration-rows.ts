import { useMemo } from "react";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { lanGuardBlockReason, vpnGuardBlocked } from "@/lib/http-client";
import {
  buildIntegrationRows,
  type InstanceProbeContext,
  type IntegrationRow,
} from "@/lib/integration-status";
import { SERVICE_IDS } from "@/lib/constants";

/**
 * The Integrations projection (lib/integration-status) over live config,
 * network state and health. Shared by the Integrations hub and the Settings
 * row, so the hub's list and the row's summary can never disagree.
 *
 * `determining` is true during the first probe batch and during a re-keyed
 * refetch after a network or workspace change; the rows then carry no health
 * verdict (every enabled instance reads "checking"), same as the Services tab.
 */
export function useIntegrationRows(): {
  rows: IntegrationRow[];
  determining: boolean;
} {
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const getActiveUrl = useConfigStore((s) => s.getActiveUrl);
  // Every store field the per-instance URL and the two guards derive from, so
  // the context is rebuilt when any of them moves: the same LAN URL is
  // reachable at home and blocked on cellular (#106); an instance attached
  // only to another workspace resolves against that workspace's home networks
  // through the observed WiFi (#418); a VPN coming up or dropping flips both
  // guards (#185, #394).
  const networkAwayFromHome = useConfigStore((s) => s.networkAwayFromHome);
  const currentWifi = useConfigStore((s) => s.currentWifi);
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeDashboardId = useConfigStore((s) => s.activeDashboardId);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const isOnLan = useConfigStore((s) => s.isOnLan);
  const isVpnActive = useConfigStore((s) => s.isVpnActive);

  const { data: healthData, isPending, isPlaceholderData } = useServiceHealth();
  const determining = isPending || isPlaceholderData;

  const rows = useMemo(() => {
    const context: Record<string, InstanceProbeContext> = {};
    for (const kind of SERVICE_IDS) {
      for (const inst of serviceInstances[kind] ?? []) {
        const activeUrl = getActiveUrl(kind, inst.id);
        context[inst.id] = {
          activeUrl,
          lanBlocked: lanGuardBlockReason(activeUrl, inst) !== null,
          vpnBlocked: vpnGuardBlocked(activeUrl, inst),
        };
      }
    }
    return buildIntegrationRows(
      serviceInstances,
      determining ? undefined : healthData,
      context,
    );
    // The network fields feed getActiveUrl and the guards indirectly.
  }, [
    serviceInstances,
    healthData,
    determining,
    getActiveUrl,
    networkAwayFromHome,
    currentWifi,
    dashboards,
    activeDashboardId,
    homeNetworks,
    isOnLan,
    isVpnActive,
  ]);

  return { rows, determining };
}
