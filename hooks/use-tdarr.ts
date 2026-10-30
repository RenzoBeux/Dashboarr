import {
  getStatus,
  getNodes,
  getResStats,
  getStatistics,
  getLibraries,
  pauseNode,
  cancelWorkerItem,
  killWorker,
  scanFiles,
  searchFiles,
  alterWorkerLimit,
  getStatusTable,
  bulkUpdateFiles,
  setAllStatus,
  getGlobalSettings,
  updateGlobalSettings,
  type TdarrScanMode,
  type TdarrWorkerType,
  type SearchFilesOptions,
} from "@/services/tdarr-api";
import { useMemo } from "react";
import {
  useInfiniteQuery, useMutation, useMutationState, useQueryClient, type InfiniteData,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import {
  TDARR_TABLE_PAGE_SIZE, applyRowAction, needsRefetchAfterAction, nextStatusTableStart,
  type TdarrRowAction,
} from "@/lib/tdarr-tables";
import type {
  TdarrGlobalSettings, TdarrStatusTableId, TdarrStatusTablePage,
} from "@/lib/types";
import { rollbackQueuePatch } from "@/lib/tdarr-queue-options";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useServiceQuery, useServiceMutation } from "@/hooks/use-service-query";

const FAST_POLL = 5000;

export function useTdarrStatus(instanceId?: string) {
  return useServiceQuery("tdarr", ["status"], getStatus, FAST_POLL, instanceId);
}

export function useTdarrNodes(instanceId?: string) {
  return useServiceQuery("tdarr", ["nodes"], getNodes, FAST_POLL, instanceId);
}

export function useTdarrResStats(instanceId?: string) {
  return useServiceQuery("tdarr", ["res-stats"], getResStats, FAST_POLL, instanceId);
}

export function useTdarrStatistics(instanceId?: string) {
  return useServiceQuery(
    "tdarr",
    ["statistics"],
    getStatistics,
    POLLING_INTERVALS.queue,
    instanceId,
  );
}

export function useTdarrLibraries(instanceId?: string) {
  return useServiceQuery(
    "tdarr",
    ["libraries"],
    getLibraries,
    POLLING_INTERVALS.queue,
    instanceId,
  );
}

export function useTdarrPauseNode(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    ({ nodeId, paused }: { nodeId: string; paused: boolean }, id) =>
      pauseNode(nodeId, paused, id),
    instanceId,
  );
}

export function useTdarrCancelWorkerItem(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    ({ nodeId, workerId, cause }: { nodeId: string; workerId: string; cause: string }, id) =>
      cancelWorkerItem(nodeId, workerId, cause, id),
    instanceId,
  );
}

export function useTdarrKillWorker(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    ({ nodeId, workerId }: { nodeId: string; workerId: string }, id) =>
      killWorker(nodeId, workerId, id),
    instanceId,
  );
}

export function useTdarrScanFiles(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (
      { dbID, arrayOrPath, mode }: { dbID: string; arrayOrPath: string; mode: TdarrScanMode },
      id,
    ) => scanFiles(dbID, arrayOrPath, mode, id),
    instanceId,
  );
}

export function useTdarrSearchFiles(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (opts: SearchFilesOptions, id) => searchFiles(opts, id),
    instanceId,
  );
}

export function useTdarrAlterWorkerLimit(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (
      {
        nodeId,
        workerType,
        process,
      }: { nodeId: string; workerType: TdarrWorkerType; process: "increase" | "decrease" },
      id,
    ) => alterWorkerLimit(nodeId, workerType, process, id),
    instanceId,
  );
}

export function useTdarrStatusTable(table: TdarrStatusTableId, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("tdarr", instanceId);
  return useInfiniteQuery({
    // Under ["tdarr", id] so useServiceMutation's invalidation and the tab's
    // pull-to-refresh both reach it. No refetchInterval: refetching an infinite
    // query re-fetches every loaded page.
    queryKey: ["tdarr", id, "status-table", table] as const,
    queryFn: ({ pageParam }) =>
      getStatusTable(table, pageParam, TDARR_TABLE_PAGE_SIZE, id ?? undefined),
    initialPageParam: 0,
    getNextPageParam: nextStatusTableStart,
    enabled: enabled && !!id,
    staleTime: 10_000,
  });
}

/**
 * Per-file actions on one status table. Rather than invalidating the whole
 * ["tdarr", id] slice (which refetches every loaded page of this table plus
 * every other Tdarr query), apply the action to the cached pages, refresh the
 * statistics doc for the chip counts, and only mark the other tables stale.
 *
 * The table and instance travel with each mutation (variables / onMutate
 * context) rather than through the hook's closure: TanStack hands a pending
 * mutation the options of the latest render, so switching tables mid-action
 * would otherwise patch the newly selected table's cache.
 */
export function useTdarrBulkUpdateFiles(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("tdarr", instanceId);
  return useMutation({
    mutationFn: (
      { fileIds, action }: { table: TdarrStatusTableId; fileIds: string[]; action: TdarrRowAction },
    ) => bulkUpdateFiles(fileIds, action.updatedObj, id ?? undefined),
    onMutate: () => ({ id }),
    onSuccess: async (_data, { table, fileIds, action }, onMutateResult) => {
      const target = onMutateResult.id;
      const tableKey = ["tdarr", target, "status-table", table] as const;
      // A page load still in flight started from the pre-action pages and would
      // write the acted-on rows back when it lands, so cancel it first.
      const loading = queryClient.isFetching({ queryKey: tableKey, exact: true }) > 0;
      if (loading) await queryClient.cancelQueries({ queryKey: tableKey, exact: true });
      const next = queryClient.setQueryData<InfiniteData<TdarrStatusTablePage>>(
        tableKey,
        (data) => applyRowAction(data, fileIds, action),
      );
      void queryClient.invalidateQueries({
        queryKey: ["tdarr", target, "status-table"],
        refetchType: "none",
      });
      // Reload after a cancelled page load, or when an emptied last page reads
      // as the end of the table.
      if (loading || needsRefetchAfterAction(next)) {
        void queryClient.invalidateQueries({ queryKey: tableKey, exact: true });
      }
      void queryClient.invalidateQueries({ queryKey: ["tdarr", target, "statistics"] });
    },
  });
}

// "<Action> all" rewrites a whole table, so the loaded pages are refetched,
// along with the counts; the other Tdarr queries are left alone.
export function useTdarrSetAllStatus(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("tdarr", instanceId);
  return useMutation({
    mutationFn: (
      { table, updatedObj }: { table: TdarrStatusTableId; updatedObj: Record<string, unknown> },
    ) => setAllStatus(table, updatedObj, id ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tdarr", id, "status-table"] });
      void queryClient.invalidateQueries({ queryKey: ["tdarr", id, "statistics"] });
    },
  });
}

const globalSettingsMutationKey = (id: string | null | undefined) =>
  ["tdarr", id, "update-global-settings"] as const;

/**
 * `active` gates fetching and polling (Queue Options only reads it while expanded).
 * A read that lands while a write is pending (pull-to-refresh, the poll) carries
 * the server's pre-write values, so the pending patches are laid back over it,
 * in tap order.
 */
export function useTdarrGlobalSettings(active = true, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("tdarr", instanceId);
  const query = useServiceQuery(
    "tdarr", ["global-settings"], getGlobalSettings, POLLING_INTERVALS.queue, instanceId, active,
  );
  const pending = useMutationState({
    filters: { mutationKey: globalSettingsMutationKey(id), status: "pending" },
    select: (m) => m.state.variables as Partial<TdarrGlobalSettings>,
  });
  const data = useMemo(
    () => query.data && pending.reduce<TdarrGlobalSettings>((acc, p) => ({ ...acc, ...p }), query.data),
    [query.data, pending],
  );
  return { data, isLoading: query.isLoading };
}

/**
 * Optimistic: the patch lands in the cache at once and is rolled back if the
 * write fails, so a switch never snaps back while the write is in flight. The
 * rollback only touches the failed patch's own fields, so it can't undo a
 * newer toggle that is still in flight. Writes share a per-instance scope, so
 * they reach the server one at a time in tap order (onMutate still runs at
 * once, so the switch stays instant).
 */
export function useTdarrUpdateGlobalSettings(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("tdarr", instanceId);
  const key = ["tdarr", id, "global-settings"] as const;
  const mutationKey = globalSettingsMutationKey(id);
  return useMutation({
    mutationKey,
    scope: { id: `tdarr-global-settings-${id}` },
    mutationFn: (patch: Partial<TdarrGlobalSettings>) =>
      updateGlobalSettings(patch, id ?? undefined),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<TdarrGlobalSettings>(key);
      if (prev) queryClient.setQueryData<TdarrGlobalSettings>(key, { ...prev, ...patch });
      return { prev };
    },
    onSuccess: (_data, patch) => {
      // A read that landed mid-write may hold the pre-write values. Put the
      // patch back before the pending overlay lets go of it, so the switch
      // doesn't flick back until the refetch below lands.
      queryClient.setQueryData<TdarrGlobalSettings>(key, (current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    onError: (_err, patch, context) => {
      const prev = context?.prev;
      if (!prev) return;
      queryClient.setQueryData<TdarrGlobalSettings>(key, (current) =>
        current ? rollbackQueuePatch(current, prev, patch) : prev,
      );
    },
    onSettled: () => {
      // With several toggles in flight, only the last one to settle refetches;
      // an earlier refetch would land the server's pre-write value mid-flight.
      if (queryClient.isMutating({ mutationKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
