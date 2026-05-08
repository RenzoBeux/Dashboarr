import { useConfigStore } from "@/store/config-store";
import { useShallow } from "zustand/react/shallow";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";

/**
 * Read + set the currently-selected instance for a service kind. Used by the
 * per-service tab chip switcher: when the user taps a chip, the setter writes
 * the new UUID to `activeInstance[serviceId]`, which auto-cascades through
 * every per-service hook (their `useInstanceTarget` selector flips), the
 * legacy `state.services[id]` derived view, and the persisted store.
 *
 * `instances` is the ordered enabled-only list — what the chip row should
 * render. Disabled instances are filtered out so a half-configured second
 * server doesn't show up in the picker.
 */
export function useActiveInstance(serviceId: ServiceId): {
  instances: ServiceInstance[];
  activeId: string | null;
  setActiveId: (id: string) => void;
} {
  // useShallow stops the new-array-every-render reference instability that
  // would otherwise re-render the parent on every unrelated store update.
  const instances = useConfigStore(
    useShallow((s) =>
      (s.serviceInstances[serviceId] ?? []).filter((i) => i.enabled),
    ),
  );
  const activeId = useConfigStore(
    (s) =>
      s.activeInstance[serviceId] ??
      s.serviceInstances[serviceId]?.find((i) => i.enabled)?.id ??
      null,
  );
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  return {
    instances,
    activeId,
    setActiveId: (id: string) => setActiveInstance(serviceId, id),
  };
}
