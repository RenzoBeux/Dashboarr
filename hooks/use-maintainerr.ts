import { getCollections, getHealth, getVersion } from "@/services/maintainerr-api";
import { useServiceQuery } from "@/hooks/use-service-query";

// Collections carry mediaCount inline, so a single call powers both the list
// and the overview totals. A minute matches Maintainerr's own handler cadence.
export function useMaintainerrCollections(instanceId?: string) {
  return useServiceQuery("maintainerr", ["collections"], (id) => getCollections(id), 60_000, instanceId);
}

// The database/liveness detail behind the offline dot (surfaces a "degraded"
// banner when the app is up but its database is unreachable).
export function useMaintainerrHealth(instanceId?: string) {
  return useServiceQuery("maintainerr", ["health"], (id) => getHealth(id), 60_000, instanceId);
}

// Version + update-available banner; it changes rarely, so refetch on a long beat.
export function useMaintainerrVersion(instanceId?: string) {
  return useServiceQuery("maintainerr", ["version"], (id) => getVersion(id), 1_800_000, instanceId);
}
