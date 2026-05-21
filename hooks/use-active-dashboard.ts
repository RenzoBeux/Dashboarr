import { useMemo } from "react";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS, type ServiceId } from "@/lib/constants";
import type { Dashboard } from "@/store/config-store";

// Returns the dashboard whose id matches `activeDashboardId`. Falls back to
// the first dashboard (which always exists — addDashboard/removeDashboard
// guarantee at least one) when the active id is somehow stale.
export function useActiveDashboard(): Dashboard | undefined {
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeId = useConfigStore((s) => s.activeDashboardId);
  return dashboards.find((d) => d.id === activeId) ?? dashboards[0];
}

// Set of instance UUIDs attached to the active dashboard. Falls back to
// "every currently-known instance attached" when the field is missing
// (pre-migration shape or a fresh, unsaved dashboard).
export function useAttachedInstances(): ReadonlySet<string> {
  const d = useActiveDashboard();
  const list = d?.attachedInstances;
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  return useMemo(() => {
    if (list) return new Set<string>(list);
    const out = new Set<string>();
    for (const id of SERVICE_IDS) {
      for (const inst of serviceInstances[id] ?? []) {
        out.add(inst.id);
      }
    }
    return out;
  }, [list, serviceInstances]);
}

// Derived set of kinds whose attached set has at least one instance. Used by
// surfaces that gate at kind granularity (widget visibility, tab
// pickability, kind-level navigation), where the precise instance-level
// filter would be too aggressive.
export function useAttachedKinds(): ReadonlySet<ServiceId> {
  const attached = useAttachedInstances();
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  return useMemo(() => {
    const out = new Set<ServiceId>();
    for (const id of SERVICE_IDS) {
      const list = serviceInstances[id] ?? [];
      if (list.some((inst) => attached.has(inst.id))) {
        out.add(id);
      }
    }
    return out;
  }, [attached, serviceInstances]);
}
