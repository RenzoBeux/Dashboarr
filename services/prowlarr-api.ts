import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
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
  // forceSave=true skips Prowlarr's pre-save validation (which test-pings the
  // indexer). Without it, re-enabling an indexer can no-op silently if the
  // validation step fails — the PUT returns 200 with the indexer still
  // disabled. With forceSave the toggle persists regardless.
  return serviceRequest<ProwlarrIndexer>("prowlarr", `/indexer/${indexer.id}`, {
    method: "PUT",
    params: { forceSave: true },
    body: JSON.stringify({ ...indexer, enable }),
    instanceId,
  });
}

// --- Search ---

// Fans out to every configured indexer, so it gets the interactive-search
// timeout rather than the 15s default. `signal` is the caller's (TanStack
// Query's) cancel channel — without it a hung fetch outlives the search that
// started it and later searches dedupe onto the zombie (#290, #314).
export function searchAll(
  query: string,
  indexerIds?: number[],
  categories?: number[],
  instanceId?: string,
  signal?: AbortSignal,
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
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
    signal,
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
