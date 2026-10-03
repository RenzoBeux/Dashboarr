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
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { TDARR_TABLE_PAGE_SIZE, nextStatusTableStart } from "@/lib/tdarr-tables";
import type { TdarrGlobalSettings, TdarrStatusTableId } from "@/lib/types";
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

export function useTdarrBulkUpdateFiles(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (
      { fileIds, updatedObj }: { fileIds: string[]; updatedObj: Record<string, unknown> },
      id,
    ) => bulkUpdateFiles(fileIds, updatedObj, id),
    instanceId,
  );
}

export function useTdarrSetAllStatus(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (
      { table, updatedObj }: { table: TdarrStatusTableId; updatedObj: Record<string, unknown> },
      id,
    ) => setAllStatus(table, updatedObj, id),
    instanceId,
  );
}

export function useTdarrGlobalSettings(instanceId?: string) {
  return useServiceQuery(
    "tdarr", ["global-settings"], getGlobalSettings, POLLING_INTERVALS.queue, instanceId,
  );
}

export function useTdarrUpdateGlobalSettings(instanceId?: string) {
  return useServiceMutation(
    "tdarr",
    (patch: Partial<TdarrGlobalSettings>, id) => updateGlobalSettings(patch, id),
    instanceId,
  );
}
