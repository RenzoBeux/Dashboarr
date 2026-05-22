import { useQuery } from "@tanstack/react-query";
import { checkInstanceHealth } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS, POLLING_INTERVALS, SERVICE_DEFAULTS } from "@/lib/constants";
import type {
  HealthStatusKind,
  ServiceHealthStatus,
  ServiceInstanceHealthStatus,
} from "@/lib/types";

/**
 * Health check for every configured (kind, instance) pair. The result still
 * has one entry per kind — `find(s => s.id === "radarr")` — so existing
 * consumers keep working. Each entry now carries an `instances` array with
 * per-instance details for the notification watcher and any UI that wants to
 * show "Radarr 4K is offline" instead of just "Radarr is offline".
 */
export function useServiceHealth() {
  const serviceInstances = useConfigStore((s) => s.serviceInstances);

  return useQuery({
    queryKey: ["serviceHealth"],
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
