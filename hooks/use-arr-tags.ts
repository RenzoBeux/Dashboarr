import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createArrTag,
  getArrTags,
  type ArrTagService,
} from "@/services/arr-tags";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { upsertTag } from "@/lib/arr-tag-input";
import type { ArrTag } from "@/lib/types";

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
// so they never go stale on their own; useCreateArrTag writes a new tag straight
// into this cache.
export function useArrTags(service: ArrTagService, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "tags"],
    queryFn: () => getArrTags(service, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

// Create a tag right away, the way Radarr/Sonarr's own tag input does, so the
// pickers can select it before the add/edit form is saved (issue #485). The
// result is upserted into the tag list with no refetch, which is also what
// keeps demo mode (static fixtures) showing it. When the list was never loaded
// it is refetched instead: seeding a one-item list into a query that never goes
// stale would hide every other tag.
export function useCreateArrTag(service: ArrTagService, instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget(service, instanceId);
  return useMutation({
    mutationFn: (label: string) => createArrTag(service, label, id ?? undefined),
    onSuccess: (tag) => {
      const queryKey = [service, id, "tags"];
      if (queryClient.getQueryData<ArrTag[]>(queryKey)) {
        queryClient.setQueryData<ArrTag[]>(queryKey, (prev) => upsertTag(prev, tag));
      } else {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
