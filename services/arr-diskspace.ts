import { serviceRequest } from "@/lib/http-client";
import type { ArrDiskSpace } from "@/lib/types";

// Radarr, Sonarr and Lidarr all expose the System → Status disk table at
// /diskspace with X-Api-Key auth and an identical payload, so one function
// serves all three (SERVICE_DEFAULTS already routes each kind's API base path).
export type ArrDiskSpaceService = "radarr" | "sonarr" | "lidarr";

export function getArrDiskSpace(
  service: ArrDiskSpaceService,
  instanceId?: string,
): Promise<ArrDiskSpace[]> {
  return serviceRequest<ArrDiskSpace[]>(service, "/diskspace", { instanceId });
}

// Special sentinel used in widget settings to mean "show every mount the
// source reports". Stored as a string (not null) so it survives JSON
// export/import, and so mounts that appear later are auto-included — mirrors
// INSTANCE_BINDING_ALL / NETWORK_INTERFACES_ALL.
export const DISK_PATHS_ALL = "all" as const;
export type DiskPathsValue = string[] | typeof DISK_PATHS_ALL;

/**
 * Apply a widget's path selection to a /diskspace payload. Always sorts by
 * path — the API order is arbitrary and would shuffle rows between polls.
 * "all" returns everything; an array restricts to those exact path strings.
 */
export function selectDiskSpace(
  disks: ArrDiskSpace[] | undefined,
  selection: DiskPathsValue,
): ArrDiskSpace[] {
  if (!disks) return [];
  const sorted = [...disks].sort((a, b) => a.path.localeCompare(b.path));
  if (selection === DISK_PATHS_ALL) return sorted;
  const allowed = new Set(selection);
  return sorted.filter((d) => allowed.has(d.path));
}
