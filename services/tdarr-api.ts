import { serviceRequest } from "@/lib/http-client";
import type {
  TdarrFileItem,
  TdarrLibrary,
  TdarrNodes,
  TdarrResStats,
  TdarrStatistics,
  TdarrStatus,
} from "@/lib/types";

// Tdarr's REST API lives on the server process (default port 8266, not the
// 8265 WebUI). Auth is optional server-side (X-Api-Key, injected by the http
// client's default branch). Most reads are simple GETs; the database-backed
// ones go through one shared POST /cruddb endpoint keyed by a `collection`
// name, and file search is a separate POST /search-db.

export function getStatus(instanceId?: string): Promise<TdarrStatus> {
  return serviceRequest<TdarrStatus>("tdarr", "/status", { instanceId });
}

export function getNodes(instanceId?: string): Promise<TdarrNodes> {
  return serviceRequest<TdarrNodes>("tdarr", "/get-nodes", { instanceId });
}

export function getResStats(instanceId?: string): Promise<TdarrResStats> {
  return serviceRequest<TdarrResStats>("tdarr", "/get-res-stats", {
    method: "POST",
    body: JSON.stringify({}),
    instanceId,
  });
}

function cruddbGetAll<T>(collection: string, instanceId?: string): Promise<T> {
  return serviceRequest<T>("tdarr", "/cruddb", {
    method: "POST",
    body: JSON.stringify({ data: { collection, mode: "getAll" } }),
    instanceId,
  });
}

export function getStatistics(instanceId?: string): Promise<TdarrStatistics[]> {
  return cruddbGetAll<TdarrStatistics[]>("StatisticsJSONDB", instanceId);
}

export function getStagedQueue(instanceId?: string): Promise<unknown[]> {
  return cruddbGetAll<unknown[]>("StagedJSONDB", instanceId);
}

export function getLibraries(instanceId?: string): Promise<TdarrLibrary[]> {
  return cruddbGetAll<TdarrLibrary[]>("LibrarySettingsJSONDB", instanceId);
}

export interface SearchFilesOptions {
  query?: string;
  page?: number;
  pageSize?: number;
  greaterThanGB?: number;
  lessThanGB?: number;
}

// /search-db 400s if greaterThanGB/lessThanGB are omitted even though the
// (thin, auto-generated) API docs don't mark them required — confirmed live.
export function searchFiles(
  opts: SearchFilesOptions = {},
  instanceId?: string,
): Promise<TdarrFileItem[]> {
  const {
    query = "",
    page = 0,
    pageSize = 50,
    greaterThanGB = 0,
    lessThanGB = 100000,
  } = opts;
  return serviceRequest<TdarrFileItem[]>("tdarr", "/search-db", {
    method: "POST",
    body: JSON.stringify({
      data: { string: query, page, start: page, pageSize, greaterThanGB, lessThanGB },
    }),
    instanceId,
  });
}

export function pauseNode(
  nodeId: string,
  paused: boolean,
  instanceId?: string,
): Promise<unknown> {
  return serviceRequest("tdarr", "/update-node", {
    method: "POST",
    body: JSON.stringify({ data: { nodeID: nodeId, nodeUpdates: { nodePaused: paused } } }),
    instanceId,
  });
}

export function cancelWorkerItem(
  nodeId: string,
  workerId: string,
  cause: string,
  instanceId?: string,
): Promise<unknown> {
  return serviceRequest("tdarr", "/cancel-worker-item", {
    method: "POST",
    body: JSON.stringify({ data: { nodeID: nodeId, workerID: workerId, cause } }),
    instanceId,
  });
}

export function killWorker(
  nodeId: string,
  workerId: string,
  instanceId?: string,
): Promise<unknown> {
  return serviceRequest("tdarr", "/kill-worker", {
    method: "POST",
    body: JSON.stringify({ data: { nodeID: nodeId, workerID: workerId } }),
    instanceId,
  });
}

export type TdarrScanMode = "scanFindNew" | "scanFresh";

// dbID/arrayOrPath/mode confirmed by tracing the Tdarr WebUI's own bundle —
// not in the (thin) public API docs, which only say scanConfig is "an
// object". scanFindNew looks for new files only; scanFresh re-queues every
// file in the library for transcode + health check (its own UI gates that
// mode behind a confirmation for the same reason).
export function scanFiles(
  dbID: string,
  arrayOrPath: string,
  mode: TdarrScanMode,
  instanceId?: string,
): Promise<unknown> {
  return serviceRequest("tdarr", "/scan-files", {
    method: "POST",
    body: JSON.stringify({ data: { scanConfig: { dbID, arrayOrPath, mode } } }),
    instanceId,
  });
}

export type TdarrWorkerType =
  | "transcodecpu"
  | "transcodegpu"
  | "healthcheckcpu"
  | "healthcheckgpu";

// Increment/decrement style, not set-to-N — mirrors Tdarr's own node settings
// UI (confirmed live: "increase" then "decrease" round-trips workerLimits).
export function alterWorkerLimit(
  nodeId: string,
  workerType: TdarrWorkerType,
  process: "increase" | "decrease",
  instanceId?: string,
): Promise<unknown> {
  return serviceRequest("tdarr", "/alter-worker-limit", {
    method: "POST",
    body: JSON.stringify({ data: { nodeID: nodeId, process, workerType } }),
    instanceId,
  });
}
