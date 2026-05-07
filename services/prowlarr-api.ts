import { serviceRequest } from "@/lib/http-client";
import type {
  ProwlarrIndexer,
  ProwlarrIndexerStatus,
  ProwlarrSearchResult,
  ProwlarrIndexerStats,
} from "@/lib/types";

// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Prowlarr is used.

// --- Indexers ---

export function getIndexers(instanceId?: string): Promise<ProwlarrIndexer[]> {
  return serviceRequest<ProwlarrIndexer[]>("prowlarr", "/indexer", { instanceId });
}

export function getIndexerStatuses(
  instanceId?: string,
): Promise<ProwlarrIndexerStatus[]> {
  return serviceRequest<ProwlarrIndexerStatus[]>("prowlarr", "/indexerstatus", {
    instanceId,
  });
}

export function testIndexer(id: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("prowlarr", `/indexer/${id}/test`, {
    method: "POST",
    instanceId,
  });
}

export function toggleIndexer(
  indexer: ProwlarrIndexer,
  enable: boolean,
  instanceId?: string,
): Promise<ProwlarrIndexer> {
  return serviceRequest<ProwlarrIndexer>("prowlarr", `/indexer/${indexer.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...indexer, enable }),
    instanceId,
  });
}

// --- Search ---

export function searchAll(
  query: string,
  indexerIds?: number[],
  categories?: number[],
  instanceId?: string,
): Promise<ProwlarrSearchResult[]> {
  const params: Record<string, string | number | boolean> = {
    query,
    type: "search",
  };
  if (indexerIds?.length) {
    params.indexerIds = indexerIds.join(",");
  }
  if (categories?.length) {
    params.categories = categories.join(",");
  }
  return serviceRequest<ProwlarrSearchResult[]>("prowlarr", "/search", {
    params,
    instanceId,
  });
}

// --- Stats ---

export function getIndexerStats(instanceId?: string): Promise<ProwlarrIndexerStats> {
  return serviceRequest<ProwlarrIndexerStats>("prowlarr", "/indexerstats", {
    instanceId,
  });
}

// --- Grab (send to download client) ---

export function grabRelease(
  guid: string,
  indexerId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("prowlarr", "/search", {
    method: "POST",
    body: JSON.stringify({ guid, indexerId }),
    instanceId,
  });
}
