import { useMemo } from "react";
import { useConfigStore } from "@/store/config-store";
import { useShallow } from "zustand/react/shallow";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";

/**
 * Read + set the currently-selected instance for a service kind. Used by the
 * per-service tab chip switcher: when the user taps a chip, the setter writes
 * the new UUID to `activeInstance[serviceId]`, which auto-cascades through
 * every per-service hook (their `useInstanceTarget` selector flips), the
 * legacy `state.services[id]` derived view, and the persisted store.
 *
 * `instances` is the ordered list filtered to enabled AND attached to the
 * active workspace. Without the attachment filter, the picker would offer
 * instances the workspace doesn't include — taps on those would write a pin
 * that `deriveActiveInstance` then rejects, snapping the selection back to
 * the first attached instance with no feedback.
 *
 * `activeId` falls back to the first enabled+attached instance when the
 * workspace has no explicit pin, matching `deriveActiveInstance`'s behavior.
 */
export function useActiveInstance(serviceId: ServiceId): {
  instances: ServiceInstance[];
  activeId: string | null;
  setActiveId: (id: string) => void;
} {
  const attached = useAttachedInstances();
  // useShallow stops the new-array-every-render reference instability that
  // would otherwise re-render the parent on every unrelated store update.
  const rawInstances = useConfigStore(
    useShallow((s) => s.serviceInstances[serviceId] ?? []),
  );
  const instances = useMemo(
    () => rawInstances.filter((i) => i.enabled && attached.has(i.id)),
    [rawInstances, attached],
  );
  const activeId = useConfigStore((s) => s.activeInstance[serviceId]) ??
    instances[0]?.id ??
    null;
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  return {
    instances,
    activeId,
    setActiveId: (id: string) => setActiveInstance(serviceId, id),
  };
}
