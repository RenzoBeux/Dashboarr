import { serviceRequest } from "@/lib/http-client";

// Sonarr/Radarr/Prowlarr/Lidarr all expose `GET <apiBasePath>/health`, the
// array of issues surfaced on each app's System > Health page (down indexers,
// pending updates, failed lists, …). The relative path is identical across the
// four — it resolves under each service's apiBasePath — so one shared fetch
// covers all of them rather than four copies (issue #210).

export type ArrHealthType = "ok" | "notice" | "warning" | "error";

export interface ArrHealthIssue {
  source: string;
  type: ArrHealthType;
  message: string;
  wikiUrl?: string;
}

// The *arr kinds that expose a /health endpoint.
export type ArrHealthServiceId = "radarr" | "sonarr" | "prowlarr" | "lidarr";

export const ARR_HEALTH_SERVICE_IDS: readonly ArrHealthServiceId[] = [
  "radarr",
  "sonarr",
  "prowlarr",
  "lidarr",
] as const;

export function getArrHealth(
  serviceId: ArrHealthServiceId,
  instanceId?: string,
): Promise<ArrHealthIssue[]> {
  return serviceRequest<ArrHealthIssue[]>(serviceId, "/health", { instanceId });
}

// Upstream parity (issue #268): the *arr Health pages render a test-tube
// "Test All" button only for these health sources. Radarr/Sonarr (/api/v3) and
// Prowlarr/Lidarr (/api/v1) all expose indexer/testall and
// downloadclient/testall; applications/testall (note the plural) is
// Prowlarr-only.
const TEST_ALL_BY_SOURCE: Record<string, { path: string; prowlarrOnly?: true }> = {
  IndexerStatusCheck: { path: "/indexer/testall" },
  IndexerLongTermStatusCheck: { path: "/indexer/testall" },
  DownloadClientStatusCheck: { path: "/downloadclient/testall" },
  ApplicationStatusCheck: { path: "/applications/testall", prowlarrOnly: true },
  ApplicationLongTermStatusCheck: { path: "/applications/testall", prowlarrOnly: true },
};

// null → this source has no test action; render nothing, matching upstream.
export function testAllPathForHealthSource(
  serviceId: ArrHealthServiceId,
  source: string,
): string | null {
  const entry = TEST_ALL_BY_SOURCE[source];
  if (!entry) return null;
  if (entry.prowlarrOnly && serviceId !== "prowlarr") return null;
  return entry.path;
}

// testall runs synchronously server-side — the response doesn't arrive until
// every provider has been probed, and an instance with dozens of indexers can
// take well over a minute. The 15s serviceRequest default would abort mid-run
// and misreport failure while the server keeps testing.
const TEST_ALL_TIMEOUT_MS = 120_000;

// Newer *arr builds answer with a per-provider result list, older ones with an
// empty body; callers ignore both — a 2xx means the tests ran.
export function testAllForHealthSource(
  serviceId: ArrHealthServiceId,
  source: string,
  instanceId?: string,
): Promise<unknown> {
  const path = testAllPathForHealthSource(serviceId, source);
  if (!path) {
    return Promise.reject(
      new Error(`No test action for health source ${source}`),
    );
  }
  return serviceRequest<unknown>(serviceId, path, {
    method: "POST",
    // Empty body: serviceRequest only infers Content-Type when a body exists.
    headers: { "Content-Type": "application/json" },
    instanceId,
    timeout: TEST_ALL_TIMEOUT_MS,
  });
}

// Worst severity across a set of issues, used to colour the alert badge.
// "notice" is folded into "warning" (amber); only "error" escalates to red.
// Returns null when there's nothing to flag.
export type ArrHealthSeverity = "warning" | "error";

export function worstSeverity(
  issues: ArrHealthIssue[],
): ArrHealthSeverity | null {
  let severity: ArrHealthSeverity | null = null;
  for (const issue of issues) {
    if (issue.type === "error") return "error";
    if (issue.type === "warning" || issue.type === "notice") severity = "warning";
  }
  return severity;
}

// Per-issue accent colour in the details sheet (notice shares warning's amber).
export const HEALTH_TYPE_COLOR: Record<ArrHealthType, string> = {
  ok: "#22c55e",
  notice: "#f59e0b",
  warning: "#f59e0b",
  error: "#ef4444",
};
