import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { checkInstanceHealth } from "@/lib/http-client";
import { qbHealthCheck } from "@/services/qbittorrent-api";
import { useConfigStore } from "@/store/config-store";
import type { ServiceInstance, ServiceSecrets } from "@/store/config-store";
import { SERVICE_IDS, POLLING_INTERVALS, SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import type {
  HealthStatusKind,
  ServiceHealthStatus,
  ServiceInstanceHealthStatus,
} from "@/lib/types";

// The exact inputs each per-instance probe depends on. `resolveUrl` is
// store.getActiveUrl, which already folds in useRemote + autoSwitchNetwork +
// networkAwayFromHome, so the network flags are passed only to keep them in
// the signature (and as honest deps).
export interface HealthProbeInputs {
  serviceInstances: Record<ServiceId, ServiceInstance[]>;
  instanceSecrets: Record<string, ServiceSecrets>;
  globalCustomHeaders: Record<string, string>;
  autoSwitchNetwork: boolean;
  networkAwayFromHome: boolean;
  resolveUrl: (id: ServiceId, instanceId: string) => string;
}

/**
 * A stable string fingerprint of everything the health probes actually send:
 * each enabled instance's resolved URL, whether it carries credentials, its
 * cert policy, and its merged custom-header names. Folding this into the
 * `useServiceHealth` query key makes React Query refetch whenever any of it
 * changes — most importantly when NetInfo flips the home/away flag (which
 * flips `resolveUrl` from local to remote and back).
 *
 * Before this, the query used a static key with a 30s interval, so a verdict
 * computed before the network settled — e.g. a remote-URL probe fired at cold
 * start while the persisted away flag was still stale-true — stayed frozen
 * until a reconnect event (toggling a VPN) or an app relaunch forced a
 * refetch. That is the #106 report: services work on the LAN but the dot is
 * stuck red, and only Tailscale on/off changes it.
 *
 * Credential *values* are intentionally reduced to presence so secrets never
 * land in a query key; a same-presence key edit is picked up by the interval.
 */
export function buildHealthProbeSignature(inputs: HealthProbeInputs): string {
  const globalHeaderKeys = Object.keys(inputs.globalCustomHeaders);
  const parts: string[] = [
    `net:${inputs.autoSwitchNetwork ? 1 : 0}:${inputs.networkAwayFromHome ? 1 : 0}`,
  ];
  for (const id of SERVICE_IDS) {
    for (const inst of inputs.serviceInstances[id] ?? []) {
      if (!inst.enabled) continue;
      const url = inputs.resolveUrl(id, inst.id);
      const s = inputs.instanceSecrets[inst.id] ?? {};
      const hasCreds = s.apiKey || s.username || s.password ? 1 : 0;
      // Mirror getMergedHeaders' merge (global + per-instance) by name only.
      const headerKeys = [
        ...globalHeaderKeys,
        ...Object.keys(s.customHeaders ?? {}),
      ]
        .sort()
        .join(",");
      parts.push(
        `${id}:${inst.id}:${url}:${hasCreds}:${inst.ignoreCertErrors ? 1 : 0}:${headerKeys}`,
      );
    }
  }
  return parts.join("|");
}

/**
 * Health check for every configured (kind, instance) pair. The result still
 * has one entry per kind — `find(s => s.id === "radarr")` — so existing
 * consumers keep working. Each entry now carries an `instances` array with
 * per-instance details for the notification watcher and any UI that wants to
 * show "Radarr 4K is offline" instead of just "Radarr is offline".
 */
export function useServiceHealth() {
  // Subscribe to everything that feeds the per-instance probe so the verdict
  // refreshes when any of it changes (see buildHealthProbeSignature for why).
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const instanceSecrets = useConfigStore((s) => s.instanceSecrets);
  const networkAwayFromHome = useConfigStore((s) => s.networkAwayFromHome);
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const globalCustomHeaders = useConfigStore((s) => s.globalCustomHeaders);

  const probeSignature = useMemo(
    () =>
      buildHealthProbeSignature({
        serviceInstances,
        instanceSecrets,
        globalCustomHeaders,
        autoSwitchNetwork,
        networkAwayFromHome,
        resolveUrl: (id, instanceId) =>
          useConfigStore.getState().getActiveUrl(id, instanceId),
      }),
    [
      serviceInstances,
      instanceSecrets,
      globalCustomHeaders,
      autoSwitchNetwork,
      networkAwayFromHome,
    ],
  );

  return useQuery({
    queryKey: ["serviceHealth", probeSignature],
    // Keep showing the last verdict while a re-key refetch is in flight so the
    // dots don't flash red for a probe cycle when the network or config changes.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ServiceHealthStatus[]> => {
      // Snapshot the instance map for stable iteration. Each kind contributes
      // one ServiceHealthStatus with an `instances` breakdown — kinds with no
      // instances configured (rare; only after a user removes the last one)
      // appear as offline with an empty instances list so the kind keeps a
      // slot in the dashboard health card.
      const results = await Promise.all(
        SERVICE_IDS.map(async (id): Promise<ServiceHealthStatus> => {
          const list = serviceInstances[id] ?? [];
          if (list.length === 0) {
            return {
              id,
              name: SERVICE_DEFAULTS[id].name,
              online: false,
              status: "offline",
              instances: [],
            };
          }
          const instanceHealths: ServiceInstanceHealthStatus[] = await Promise.all(
            list.map(async (inst) => {
              if (!inst.enabled) {
                return {
                  instanceId: inst.id,
                  instanceName: inst.name,
                  online: false,
                  status: "offline",
                };
              }
              // qBittorrent routes through its own session-aware probe so the
              // poll doesn't POST /auth/login every cycle — that was racing
              // with the app's qbLogin cookie cache and tripping qBT's
              // brute-force lockout on transient hiccups (see #105, #106).
              if (id === "qbittorrent") {
                const start = Date.now();
                const status = await qbHealthCheck(inst.id);
                return {
                  instanceId: inst.id,
                  instanceName: inst.name,
                  online: status !== "offline",
                  status,
                  responseTime: status === "ok" ? Date.now() - start : undefined,
                };
              }
              const result = await checkInstanceHealth(id, inst.id);
              const status: HealthStatusKind =
                result.kind === "ok"
                  ? "ok"
                  : result.kind === "auth_failed"
                    ? "auth_failed"
                    : "offline";
              return {
                instanceId: inst.id,
                instanceName: inst.name,
                // Both ok and auth_failed servers respond to requests, so
                // they count as "online" for the binary back-compat field.
                // The tri-state dot consumers branch on `status` instead.
                online: status !== "offline",
                status,
                responseTime:
                  result.kind === "ok" ? result.responseTime : undefined,
                message: result.kind === "ok" ? undefined : result.message,
              };
            }),
          );
          // Aggregate per kind: prefer the best status across instances so a
          // user with two Radarrs (one healthy, one auth-failed) sees the kind
          // as "ok" — the dashboard widgets that route to a kind will pick
          // the healthy instance and the user can drill into Settings to fix
          // the broken one. ok > auth_failed > offline.
          const hasOk = instanceHealths.some((i) => i.status === "ok");
          const hasAuthFailed = instanceHealths.some(
            (i) => i.status === "auth_failed",
          );
          const kindStatus: HealthStatusKind = hasOk
            ? "ok"
            : hasAuthFailed
              ? "auth_failed"
              : "offline";
          const responseTimes = instanceHealths
            .filter((i) => i.status === "ok")
            .map((i) => i.responseTime)
            .filter((rt): rt is number => typeof rt === "number");
          // Display name preference: when only one instance is configured, use
          // that instance's name (matches v12 single-instance UX). With
          // multiple instances, fall back to the kind's default name so the
          // card doesn't look inconsistent.
          const name =
            list.length === 1 ? list[0].name : SERVICE_DEFAULTS[id].name;
          return {
            id,
            name,
            online: kindStatus !== "offline",
            status: kindStatus,
            responseTime:
              responseTimes.length > 0 ? Math.min(...responseTimes) : undefined,
            instances: instanceHealths,
          };
        }),
      );
      return results;
    },
    refetchInterval: POLLING_INTERVALS.serviceHealth,
  });
}
