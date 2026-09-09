import { serviceRequest } from "@/lib/http-client";
import type { ArrTag } from "@/lib/types";

// Radarr, Sonarr and Lidarr all expose their tag list at /tag with X-Api-Key
// auth and an identical { id, label } shape, so one function serves all three —
// the same call services/arr-custom-filters.ts already makes for /customfilter.
export type ArrTagService = "radarr" | "sonarr" | "lidarr";

export function getArrTags(
  service: ArrTagService,
  instanceId?: string,
): Promise<ArrTag[]> {
  return serviceRequest<ArrTag[]>(service, "/tag", { instanceId });
}
