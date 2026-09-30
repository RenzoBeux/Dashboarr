import { HttpError, serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import type {
  ProwlarrIndexer,
  ProwlarrIndexerStatus,
  ProwlarrIndexerTestResult,
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

// Servarr's provider test route is `POST /indexer/test` with the FULL indexer
// resource in the body (ProviderControllerBase.Test); there is no
// `/indexer/{id}/test`. A pass answers 200 `"{}"`. A fail throws
// ValidationException upstream, which ProwlarrErrorPipeline serializes as a
// 400 whose body is the bare failure list `[{ propertyName, errorMessage, … }]`
// — the normal outcome of testing a broken indexer, so it is parsed into a
// result rather than thrown. Everything else (401, 404, unreachable, a 400 with
// some other body) still rejects.
//
// Side effect that makes this the "retry" for a backed-off indexer (#447):
// IndexerFactory.Test records the outcome in /indexerstatus — a pass clears
// `disabledTill`, a fail starts or extends the backoff — so callers refetch
// statuses afterwards.
export async function testIndexer(
  indexer: ProwlarrIndexer,
  instanceId?: string,
): Promise<ProwlarrIndexerTestResult> {
  try {
    await serviceRequest<unknown>("prowlarr", "/indexer/test", {
      method: "POST",
      body: JSON.stringify(indexer),
      // A live round-trip to the tracker: the 15s default aborts a slow one
      // while the server is still waiting on it.
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId,
    });
    return { ok: true };
  } catch (err) {
    const error =
      err instanceof HttpError && err.status === 400
        ? parseIndexerTestFailures(err.body)
        : null;
    if (error === null) throw err;
    return { ok: false, error };
  }
}

// The joined `errorMessage`s of a ValidationFailure list, or null when the body
// isn't one, so a genuine bad request still surfaces as an error.
export function parseIndexerTestFailures(body: unknown): string | null {
  if (!Array.isArray(body)) return null;
  if (body.some((e) => typeof e !== "object" || e === null)) return null;
  const messages = (body as { errorMessage?: unknown }[])
    .map((f) => (typeof f.errorMessage === "string" ? f.errorMessage.trim() : ""))
    .filter((m) => m.length > 0);
  return messages.join("; ") || "Test failed";
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
