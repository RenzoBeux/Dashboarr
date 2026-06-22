import { useQueries, useQuery } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getArrHealth,
  worstSeverity,
  ARR_HEALTH_SERVICE_IDS,
  type ArrHealthIssue,
  type ArrHealthServiceId,
  type ArrHealthSeverity,
} from "@/services/arr-health";

export interface ArrInstanceHealth {
  instanceId: string;
  instanceName: string;
  issues: ArrHealthIssue[];
}

// One service kind's aggregated health, ready for the Health Alerts widget: the
// instances that currently have issues, the total count, and the worst severity
// across them.
export interface ArrHealthSection {
  serviceId: ArrHealthServiceId;
  instances: ArrInstanceHealth[];
  count: number;
  severity: ArrHealthSeverity;
  // A representative message for the collapsed row — the first issue matching
  // the worst severity, so the row's preview text agrees with its colour even
  // when issues span multiple instances.
  previewMessage: string;
}

interface ArrHealthTarget {
  kind: ArrHealthServiceId;
  instanceId: string;
  instanceName: string;
}

// Polls System > Health across the active workspace's Sonarr/Radarr/Prowlarr/
// Lidarr instances and groups the actionable issues into per-kind sections for
// the Health Alerts widget (issue #210). This is application-level health,
// distinct from the connectivity probe in useServiceHealth (which drives the
// status dot): an offline/errored instance yields no data here, so it
// contributes no section — only its red connectivity dot shows elsewhere.
//
// `useWorkspaceScopedInstances` returns stable (memoized) arrays, which keeps
// the `useQueries` query list from rebuilding on every unrelated store change.
export function useArrHealthSections(): {
  sections: ArrHealthSection[];
  isLoading: boolean;
} {
  // Scope to the active dashboard, like every other fan-out widget. No
  // per-widget instance binding (yet), so the "all attached" default is used.
  const radarr = useWorkspaceScopedInstances("radarr", undefined);
  const sonarr = useWorkspaceScopedInstances("sonarr", undefined);
  const prowlarr = useWorkspaceScopedInstances("prowlarr", undefined);
  const lidarr = useWorkspaceScopedInstances("lidarr", undefined);

  const targets: ArrHealthTarget[] = [
    ...radarr.map((i) => ({ kind: "radarr" as const, instanceId: i.id, instanceName: i.name })),
    ...sonarr.map((i) => ({ kind: "sonarr" as const, instanceId: i.id, instanceName: i.name })),
    ...prowlarr.map((i) => ({ kind: "prowlarr" as const, instanceId: i.id, instanceName: i.name })),
    ...lidarr.map((i) => ({ kind: "lidarr" as const, instanceId: i.id, instanceName: i.name })),
  ];

  const queries = useQueries({
    queries: targets.map((t) => ({
      queryKey: [t.kind, t.instanceId, "health"],
      queryFn: () => getArrHealth(t.kind, t.instanceId),
      refetchInterval: POLLING_INTERVALS.serviceHealth,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  // Group instances-with-issues under their kind.
  const byKind = new Map<ArrHealthServiceId, ArrInstanceHealth[]>();
  queries.forEach((q, idx) => {
    // Drop "ok" entries — only notice/warning/error are actionable alerts.
    const issues = q.data?.filter((i) => i.type !== "ok") ?? [];
    if (issues.length === 0) return;
    const t = targets[idx];
    const list = byKind.get(t.kind) ?? [];
    list.push({ instanceId: t.instanceId, instanceName: t.instanceName, issues });
    byKind.set(t.kind, list);
  });

  // Emit sections in canonical *arr order so the widget list is stable.
  const sections: ArrHealthSection[] = ARR_HEALTH_SERVICE_IDS.flatMap((kind) => {
    const instances = byKind.get(kind);
    if (!instances?.length) return [];
    const allIssues = instances.flatMap((i) => i.issues);
    const severity = worstSeverity(allIssues);
    if (!severity) return [];
    const previewMessage = (
      allIssues.find((i) =>
        severity === "error" ? i.type === "error" : i.type !== "error",
      ) ?? allIssues[0]
    ).message;
    return [
      { serviceId: kind, instances, count: allIssues.length, severity, previewMessage },
    ];
  });

  return { sections, isLoading: isInitialLoading };
}

// Single-instance variant for a service screen's health banner: follows the
// screen's active instance (like the other per-service hooks) and shares its
// query key with useArrHealthSections, so the widget and banner reuse one cached
// /health request per instance rather than each fetching their own.
export function useArrInstanceHealth(
  serviceId: ArrHealthServiceId,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
  return useQuery({
    queryKey: [serviceId, id, "health"],
    queryFn: () => getArrHealth(serviceId, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.serviceHealth,
    enabled: enabled && !!id,
  });
}
