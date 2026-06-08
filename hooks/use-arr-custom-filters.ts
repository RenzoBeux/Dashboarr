import { useQuery } from "@tanstack/react-query";
import { getArrCustomFilters } from "@/services/arr-custom-filters";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Fetch a service's saved custom filters. `useInstanceTarget` takes a runtime
// ServiceId, so one combined hook covers both Radarr and Sonarr — `service`
// only flows into the query key and fetcher, never into a conditional hook call.
// Custom filters change rarely, so we keep them fresh for a few minutes.
export function useArrCustomFilters(
  service: "radarr" | "sonarr",
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "customFilters"],
    queryFn: () => getArrCustomFilters(service, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 5 * 60_000,
  });
}
