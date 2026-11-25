import { findSabSlotPosition, moveSabSlot } from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useServiceMutation, useServiceQuery } from "@/hooks/use-service-query";

// Where one SABnzbd job sits in the queue (#515). Polled at the slow queue
// pace, not the 5 s download pace: on a long queue a lookup can take several
// requests, and the position only shifts as jobs ahead finish. A move
// refetches it at once (useServiceMutation invalidates the instance's slice).
export function useSabSlotPosition(nzoId: string, instanceId?: string, active = true) {
  return useServiceQuery(
    "sabnzbd",
    ["queue", "position", nzoId],
    (id) => findSabSlotPosition(nzoId, id),
    POLLING_INTERVALS.queue,
    instanceId,
    active,
  );
}

export function useMoveSabSlot(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    ({ nzoId, position }: { nzoId: string; position: number }, id) =>
      moveSabSlot(nzoId, position, id),
    instanceId,
  );
}
