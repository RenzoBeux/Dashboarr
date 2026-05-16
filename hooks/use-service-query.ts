import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type { ServiceId } from "@/lib/constants";

/**
 * Wraps `useQuery` for a per-instance service call: resolves the active
 * instance for the given service, gates with `enabled`, and namespaces the
 * cache key by service+instance so two configured instances never collide.
 */
export function useServiceQuery<T>(
  serviceId: ServiceId,
  keyParts: readonly unknown[],
  fetcher: (instanceId: string | undefined) => Promise<T>,
  refetchInterval: number,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
  return useQuery({
    queryKey: [serviceId, id, ...keyParts] as const,
    queryFn: () => fetcher(id ?? undefined),
    refetchInterval,
    enabled: enabled && !!id,
  });
}

/**
 * Wraps `useMutation` for a per-instance service call. Invalidates the entire
 * service+instance cache slice on success so list/detail queries refresh
 * together.
 */
export function useServiceMutation<TArgs, TResult>(
  serviceId: ServiceId,
  mutationFn: (args: TArgs, instanceId: string | undefined) => Promise<TResult>,
  instanceId?: string,
) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget(serviceId, instanceId);
  return useMutation({
    mutationFn: (args: TArgs) => mutationFn(args, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [serviceId, id] });
    },
  });
}
