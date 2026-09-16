import { useConfigStore } from "@/store/config-store";
import type { InstanceNetworkVerdict } from "@/store/config-store";

/**
 * `store.resolveInstanceNetwork` for render-time use: subscribes to every
 * store field the verdict is derived from, so a component that calls the
 * returned resolver inside render re-renders when any of them changes (the
 * user walks home/away, switches workspace, edits a dashboard's home networks,
 * toggles auto-switch or VPN-as-home). The resolver itself is a stable store
 * action, so it is safe in dependency arrays.
 */
export function useInstanceNetworkResolver(): (
  instanceId: string,
) => InstanceNetworkVerdict {
  useConfigStore((s) => s.networkAwayFromHome);
  useConfigStore((s) => s.currentWifi);
  useConfigStore((s) => s.isVpnActive);
  useConfigStore((s) => s.treatVpnAsHome);
  useConfigStore((s) => s.homeNetworks);
  useConfigStore((s) => s.dashboards);
  useConfigStore((s) => s.activeDashboardId);
  return useConfigStore((s) => s.resolveInstanceNetwork);
}
