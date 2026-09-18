import { useMemo } from "react";
import { useConfigStore } from "@/store/config-store";
import { useShallow } from "zustand/react/shallow";
import { findSameHostInstance } from "@/lib/instance-host-match";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";

/**
 * The ordered list of enabled instances for a kind. Used by aggregated
 * dashboard cards to fan a query out across every configured instance via
 * TanStack Query's `useQueries`.
 *
 * `useShallow` is load-bearing here: `.filter()` always returns a new array,
 * so without shallow equality every store change would re-trigger the parent's
 * `useQueries`, which rebuilds its query list and re-renders, in an infinite
 * loop. With shallow equality the selector only signals a change when the
 * filtered ids/names/etc. actually differ.
 */
export function useEnabledInstances(serviceId: ServiceId): ServiceInstance[] {
  return useConfigStore(
    useShallow((s) =>
      (s.serviceInstances[serviceId] ?? []).filter((i) => i.enabled),
    ),
  );
}

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
  // Only the workspace-resolved active instance (attachment + enabled aware).
  // No raw serviceInstances[serviceId][0] tail: when nothing is enabled+attached
  // in the active workspace this is null, which gates dependent queries off via
  // `enabled` below — instead of silently following another workspace's
  // instance and rendering its data (#3).
  const activeId = useConfigStore((s) => s.activeInstance[serviceId] ?? null);
  const targetId = instanceId ?? activeId;
  const enabled = useConfigStore((s) => {
    if (!targetId) return false;
    const list = s.serviceInstances[serviceId] ?? [];
    return list.find((i) => i.id === targetId)?.enabled ?? false;
  });
  return { instanceId: targetId, enabled };
}

/**
 * The enabled instance of `kind` that runs on the same host as `target`, or
 * undefined when there is none. Use this — never the active instance — before
 * rendering one service's data against another's; see lib/instance-host-match.ts
 * for why an unguarded pairing shows the wrong machine's numbers.
 */
export function useSameHostInstance(
  kind: ServiceId,
  target: { localUrl: string; remoteUrl: string } | undefined,
): ServiceInstance | undefined {
  const candidates = useEnabledInstances(kind);
  // Depend on the URLs, not the instance object: unrelated edits to the target
  // (renames, profile defaults) shouldn't re-run the match. A missing target
  // reduces to two blank URLs, which findSameHostInstance already rejects.
  const localUrl = target?.localUrl ?? "";
  const remoteUrl = target?.remoteUrl ?? "";
  return useMemo(
    () => findSameHostInstance({ localUrl, remoteUrl }, candidates),
    [candidates, localUrl, remoteUrl],
  );
}

/**
 * The full ServiceInstance a sheet or settings card is targeting: the explicit
 * `instanceId` when given, otherwise the workspace-resolved active instance for
 * the kind. Used to read per-instance preferences (e.g. the arr add-flow
 * defaults) alongside the instance-scoped profile/folder hooks.
 *
 * Returns a stable array-element reference from the store, so no `useShallow`
 * is needed — the selector only signals a change when the resolved instance
 * object itself changes.
 */
export function useTargetInstance(
  serviceId: ServiceId,
  instanceId?: string,
): ServiceInstance | undefined {
  return useConfigStore((s) => {
    const targetId = instanceId ?? s.activeInstance[serviceId] ?? null;
    if (!targetId) return undefined;
    return (s.serviceInstances[serviceId] ?? []).find((i) => i.id === targetId);
  });
}
