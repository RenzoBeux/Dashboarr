import { serviceRequest } from "@/lib/http-client";
import type {
  AutobrrFilter,
  AutobrrFindReleasesResponse,
  AutobrrIrcNetwork,
  AutobrrPushStatus,
  AutobrrReleaseStats,
} from "@/lib/types";

// Autobrr API notes:
//   - Auth is the X-API-Token header, injected centrally by lib/http-client.ts.
//   - JSON is snake_case (Go structs with explicit tags).
//   - /healthz/liveness (the ping path) is anonymous; the connection probe
//     validates the key against /release/stats instead.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Autobrr is used.

// --- Releases ---

export function getReleaseStats(instanceId?: string): Promise<AutobrrReleaseStats> {
  return serviceRequest<AutobrrReleaseStats>("autobrr", "/release/stats", { instanceId });
}

export function findReleases(
  opts: { q?: string; pushStatus?: AutobrrPushStatus; limit?: number; offset?: number } = {},
  instanceId?: string,
): Promise<AutobrrFindReleasesResponse> {
  const params: Record<string, string | number> = {
    limit: opts.limit ?? 30,
    offset: opts.offset ?? 0,
  };
  // Empty values must be omitted: autobrr 400s on an invalid push_status and
  // treats q="" as a real (empty) search term.
  if (opts.q) params.q = opts.q;
  if (opts.pushStatus) params.push_status = opts.pushStatus;
  return serviceRequest<AutobrrFindReleasesResponse>("autobrr", "/release", {
    params,
    instanceId,
  });
}

export function retryReleasePush(
  releaseId: number,
  actionStatusId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>(
    "autobrr",
    `/release/${releaseId}/actions/${actionStatusId}/retry`,
    { method: "POST", instanceId },
  );
}

// --- Filters ---

export function getFilters(instanceId?: string): Promise<AutobrrFilter[]> {
  return serviceRequest<AutobrrFilter[]>("autobrr", "/filters", { instanceId });
}

export function setFilterEnabled(
  filterId: number,
  enabled: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("autobrr", `/filters/${filterId}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
    instanceId,
  });
}

// --- IRC ---

export function getIrcNetworks(instanceId?: string): Promise<AutobrrIrcNetwork[]> {
  return serviceRequest<AutobrrIrcNetwork[]>("autobrr", "/irc", { instanceId });
}

// Upstream quirk: restarting a network is a GET (chi route
// `r.Get("/network/{id}/restart", ...)`), not a POST. It MUST only ever be
// called from a mutation — wired into a query, a background refetch would
// bounce the IRC connection.
export function restartIrcNetwork(networkId: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("autobrr", `/irc/network/${networkId}/restart`, {
    instanceId,
  });
}
