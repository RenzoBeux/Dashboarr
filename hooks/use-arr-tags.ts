import { useQuery } from "@tanstack/react-query";
import { getArrTags, type ArrTagService } from "@/services/arr-tags";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Fetch an instance's tag list. `useInstanceTarget` takes a runtime ServiceId,
// so one combined hook covers Radarr, Sonarr and Lidarr — `service` only flows
// into the query key and the fetcher, never into a conditional hook call.
//
// This is the ONLY definition of this query: useRadarrTags/useSonarrTags/
// useLidarrTags delegate here rather than declaring their own. TanStack stores
// a single queryFn per key (last observer to setOptions wins), so two hooks
// writing different fetchers to `[service, id, "tags"]` would be a latent bug.
//
// Tags change rarely and every consumer only needs them for id → label lookup,
// so they never go stale on their own; a mutation that touches tags invalidates.
export function useArrTags(service: ArrTagService, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "tags"],
    queryFn: () => getArrTags(service, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}
