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
