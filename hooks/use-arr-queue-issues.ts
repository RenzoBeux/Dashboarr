import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { toast, toastError } from "@/components/ui/toast";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { ArrQueueAdapter, ArrQueueItem } from "@/lib/arr-queue-adapter";

/**
 * The active instance's stuck queue items (#285) — grabs Radarr/Sonarr/Lidarr
 * flagged with a warning or error. A blocked import is the common case but not
 * the only one; see lib/arr-queue-issues.ts.
 *
 * The query deliberately reuses the adapter's own key + fetcher, so it shares
 * the single cache entry `useRadarrQueue` / `ArrQueueCard` already own: mounting
 * the banner costs no extra requests. Normalization stays outside the queryFn
 * for the same reason (see lib/arr-queue-adapter.ts).
 *
 * Returns the raw list only — callers that hide rows (e.g. a removal awaiting
 * its refetch) derive the summary severity from what they actually render, via
 * `worstQueueSeverity`, so the badge can't disagree with the list.
 */
export function useArrQueueIssues(adapter: ArrQueueAdapter, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget(
    adapter.serviceId,
    instanceId,
  );

  const { data } = useQuery({
    queryKey: adapter.queueQueryKey(id!),
    queryFn: () => adapter.fetchQueue(id!),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });

  const issues = useMemo<ArrQueueItem[]>(() => {
    if (!data || !id) return [];
    return adapter.toItems(data, id).filter((item) => item.severity !== null);
  }, [adapter, data, id]);

  return { issues, instanceId: id };
}

/** How a stuck grab is disposed of. See ArrQueueRemoveOptions for the flags. */
export type ArrQueueRemoveMode = "remove" | "blocklistAndSearch" | "blocklist";

const REMOVE_OPTIONS: Record<
  ArrQueueRemoveMode,
  { blocklist: boolean; skipRedownload: boolean }
> = {
  remove: { blocklist: false, skipRedownload: false },
  blocklistAndSearch: { blocklist: true, skipRedownload: false },
  blocklist: { blocklist: true, skipRedownload: true },
};

const REMOVE_TOAST: Record<ArrQueueRemoveMode, string> = {
  remove: "Removed from queue",
  blocklistAndSearch: "Blocklisted, searching for a replacement",
  blocklist: "Release blocklisted",
};

export function useRemoveFromArrQueue(
  adapter: ArrQueueAdapter,
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget(adapter.serviceId, instanceId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      queueId,
      mode,
    }: {
      queueId: number;
      mode: ArrQueueRemoveMode;
    }) => adapter.removeFromQueue(id!, queueId, REMOVE_OPTIONS[mode]),
    onSuccess: (_data, { mode }) => {
      toast(REMOVE_TOAST[mode]);
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: adapter.queueQueryKey(id) });
      // Prefix match — also refreshes the full ["<service>", id, "wanted", "all"]
      // list, since a blocklisted grab puts its media back in wanted/missing.
      queryClient.invalidateQueries({ queryKey: adapter.wantedQueryKey(id) });
    },
    onError: (err) => toastError("Failed to update queue", err),
  });
}

/**
 * Imports a blocked grab anyway via the adapter's forceImport (#325). Success
 * only means *arr accepted the ManualImport command — the import itself runs
 * async on the server, so the toast says "started" and the invalidated refetch
 * (plus the regular queue poll) is what clears the row.
 */
export function useForceImportArrQueue(
  adapter: ArrQueueAdapter,
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget(adapter.serviceId, instanceId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ downloadId }: { downloadId: string }) =>
      adapter.forceImport!(id!, downloadId),
    onSuccess: () => {
      toast(`Import started, ${adapter.displayName} is processing it`);
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: adapter.queueQueryKey(id) });
    },
    onError: (err) => toastError("Force import failed", err),
  });
}
