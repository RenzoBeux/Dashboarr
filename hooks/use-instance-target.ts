import { useConfigStore } from "@/store/config-store";
import type { ServiceId } from "@/lib/constants";

/**
 * Resolve which instance a per-service hook should query and whether it's
 * enabled. Pass `instanceId` to target a specific instance (used by aggregated
 * dashboard cards that render one slot per instance); omit it to follow the
 * user's currently-selected instance for that kind (used by per-service tabs).
 *
 * The returned `instanceId` is also what callers should fold into TanStack
 * Query keys so two configured instances never collide in the query cache.
 */
export function useInstanceTarget(
  serviceId: ServiceId,
  instanceId?: string,
): { instanceId: string | null; enabled: boolean } {
  const activeId = useConfigStore(
    (s) => s.activeInstance[serviceId] ?? s.serviceInstances[serviceId]?.[0]?.id ?? null,
  );
  const targetId = instanceId ?? activeId;
  const enabled = useConfigStore((s) => {
    if (!targetId) return false;
    const list = s.serviceInstances[serviceId] ?? [];
    return list.find((i) => i.id === targetId)?.enabled ?? false;
  });
  return { instanceId: targetId, enabled };
}
