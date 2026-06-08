import { serviceRequest } from "@/lib/http-client";
import type { ArrCustomFilter } from "@/lib/types";

// Radarr and Sonarr both expose saved custom filters at /api/v3/customfilter
// with X-Api-Key auth, so one function serves both. The web UI evaluates these
// client-side (see lib/arr-custom-filters.ts).
export function getArrCustomFilters(
  service: "radarr" | "sonarr",
  instanceId?: string,
): Promise<ArrCustomFilter[]> {
  return serviceRequest<ArrCustomFilter[]>(service, "/customfilter", {
    instanceId,
  });
}
