import { serviceRequest } from "@/lib/http-client";
import type {
  ProwlarrIndexer,
  ProwlarrIndexerStatus,
  ProwlarrSearchResult,
  ProwlarrIndexerStats,
} from "@/lib/types";

// --- Indexers ---

export function getIndexers(): Promise<ProwlarrIndexer[]> {
  return serviceRequest<ProwlarrIndexer[]>("prowlarr", "/indexer");
}

export function getIndexerStatuses(): Promise<ProwlarrIndexerStatus[]> {
  return serviceRequest<ProwlarrIndexerStatus[]>("prowlarr", "/indexerstatus");
}

export function testIndexer(id: number): Promise<void> {
  return serviceRequest<void>("prowlarr", `/indexer/${id}/test`, {
    method: "POST",
  });
}

export function toggleIndexer(
  indexer: ProwlarrIndexer,
  enable: boolean,
): Promise<ProwlarrIndexer> {
  return serviceRequest<ProwlarrIndexer>("prowlarr", `/indexer/${indexer.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...indexer, enable }),
  });
}

// --- Search ---

export function searchAll(
  query: string,
  indexerIds?: number[],
  categories?: number[],
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
  return serviceRequest<ProwlarrSearchResult[]>("prowlarr", "/search", { params });
}

// --- Stats ---

export function getIndexerStats(): Promise<ProwlarrIndexerStats> {
  return serviceRequest<ProwlarrIndexerStats>("prowlarr", "/indexerstats");
}

// --- Grab (send to download client) ---

export function grabRelease(guid: string, indexerId: number): Promise<void> {
  return serviceRequest<void>("prowlarr", "/search", {
    method: "POST",
    body: JSON.stringify({ guid, indexerId }),
  });
}
