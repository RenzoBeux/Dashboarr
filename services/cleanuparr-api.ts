import { serviceRequest } from "@/lib/http-client";
import type {
  CleanuparrEvent,
  CleanuparrJob,
  CleanuparrJobType,
  CleanuparrPaginatedResult,
  CleanuparrStats,
} from "@/lib/types";

// Cleanuparr API notes:
//   - Auth is the default X-Api-Key header (injected by lib/http-client.ts);
//     the key authenticates every [Authorize] controller, not just stats.
//   - apiBasePath is "" (the anonymous /health ping is root-mounted), so every
//     path here carries its own /api prefix — the JellyStat pattern.
//   - v2 stats only: v1 /api/stats is sunset upstream on 2026-09-01.
//   - Timeline (GET /api/v2/stats/timeline) exists for a future sparkline.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Cleanuparr is used.

export function getStats(hours = 168, instanceId?: string): Promise<CleanuparrStats> {
  return serviceRequest<CleanuparrStats>("cleanuparr", "/api/v2/stats", {
    params: { hours },
    instanceId,
  });
}

export function getJobs(instanceId?: string): Promise<CleanuparrJob[]> {
  return serviceRequest<CleanuparrJob[]>("cleanuparr", "/api/jobs", { instanceId });
}

// Seeker refuses manual triggers upstream (400) — the UI hides its button.
export function triggerJob(jobType: CleanuparrJobType, instanceId?: string): Promise<void> {
  return serviceRequest<void>("cleanuparr", `/api/jobs/${jobType}/trigger`, {
    method: "POST",
    instanceId,
  });
}

export function getEvents(
  opts: { page?: number; pageSize?: number; severity?: string; eventType?: string; search?: string } = {},
  instanceId?: string,
): Promise<CleanuparrPaginatedResult<CleanuparrEvent>> {
  const params: Record<string, string | number> = {
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 25,
  };
  if (opts.severity) params.severity = opts.severity;
  if (opts.eventType) params.eventType = opts.eventType;
  if (opts.search) params.search = opts.search;
  return serviceRequest<CleanuparrPaginatedResult<CleanuparrEvent>>("cleanuparr", "/api/events", {
    params,
    instanceId,
  });
}

// "SlowSpeedStrike" → "Slow speed strike", "QueueCleaner" → "Queue cleaner".
// Cleanuparr's breakdown keys and job types are PascalCase enum names; this is
// the one place they're made human-readable.
export function humanizeEnumName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
