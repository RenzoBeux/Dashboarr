import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import {
  unwrapBinderyList,
  fetchAllBinderyPages,
  BINDERY_PAGE_LIMIT,
} from "@/lib/bindery-normalize";
import type {
  BinderyAuthor,
  BinderyAuthorSearchResult,
  BinderyBook,
  BinderyBookStatus,
  BinderyAddAuthorPayload,
  BinderyUpdateAuthorPayload,
  BinderyUpdateBookPayload,
  BinderyMetadataProfile,
  BinderyQueueResponse,
  BinderyRootFolder,
} from "@/lib/types";

// Bindery's native /api/v1. Two rules this module exists to enforce:
//
//   1. `?apikey=` is honoured on GET/HEAD/OPTIONS only — the server ignores it
//      on mutations. Every write here therefore relies on the X-Api-Key header
//      lib/http-client.ts sets by default. Do not "simplify" a mutation onto a
//      query-param key.
//   2. `GET /book?authorId=N` takes a completely different server-side branch
//      that silently DROPS status, search, sort, mediaType, monitored and the
//      release-date bounds, and orders by release date instead of title. It
//      still answers 200, so the bug is invisible. Nothing here calls it with
//      an authorId on purpose: read the embedded `books[]` from getAuthor and
//      filter in JS instead.
//
// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific Bindery instance. When omitted, the user's
// active instance is used.


// --- Authors ---

export interface BinderyAuthorQuery {
  search?: string;
  sort?: string;
  monitored?: boolean;
}

function authorParams(query: BinderyAuthorQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.search) params.search = query.search;
  if (query.sort) params.sort = query.sort;
  // The server accepts the strings "true"/"false" and treats anything else as
  // "no filter", so an undefined here correctly means "all".
  if (query.monitored !== undefined) params.monitored = String(query.monitored);
  return params;
}

/** Every author, walked page by page. */
export function getAuthors(
  query: BinderyAuthorQuery = {},
  instanceId?: string,
): Promise<BinderyAuthor[]> {
  return fetchAllBinderyPages<BinderyAuthor>((limit, offset) =>
    serviceRequest<unknown>("bindery", "/author", {
      params: { ...authorParams(query), limit, offset },
      instanceId,
    }),
  );
}

/**
 * Author detail. Unlike the list response this embeds the full `books[]` array
 * (image-proxied like the parent), which is where real per-status counts come
 * from — `statistics` is absent here entirely.
 */
export function getAuthor(
  id: number,
  instanceId?: string,
): Promise<BinderyAuthor> {
  return serviceRequest<BinderyAuthor>("bindery", `/author/${id}`, { instanceId });
}

export function addAuthor(
  payload: BinderyAddAuthorPayload,
  instanceId?: string,
): Promise<BinderyAuthor> {
  return serviceRequest<BinderyAuthor>("bindery", "/author", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    instanceId,
  });
}

/**
 * Partial author patch. The server loads the row and applies only the fields
 * present, so send ONLY what changed — a full-entity spread would be both
 * wasteful and, for the metadata-lock fields on books, actively harmful.
 */
export function updateAuthor(
  id: number,
  payload: BinderyUpdateAuthorPayload,
  instanceId?: string,
): Promise<BinderyAuthor> {
  return serviceRequest<BinderyAuthor>("bindery", `/author/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    instanceId,
  });
}

export function deleteAuthor(
  id: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bindery", `/author/${id}`, {
    method: "DELETE",
    params: deleteFiles ? { deleteFiles: true } : undefined,
    instanceId,
  });
}

/** Re-pulls the author's catalogue from the metadata provider. */
export function refreshAuthor(id: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("bindery", `/author/${id}/refresh`, {
    method: "POST",
    instanceId,
  });
}

// --- Books ---

export interface BinderyBookQuery {
  status?: BinderyBookStatus;
  mediaType?: string;
  monitored?: boolean;
  search?: string;
  sort?: string;
}

function bookParams(query: BinderyBookQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.status) params.status = query.status;
  if (query.mediaType) params.mediaType = query.mediaType;
  if (query.search) params.search = query.search;
  if (query.sort) params.sort = query.sort;
  if (query.monitored !== undefined) params.monitored = String(query.monitored);
  return params;
}

/** Every book matching the filters, walked page by page. */
export function getBooks(
  query: BinderyBookQuery = {},
  instanceId?: string,
): Promise<BinderyBook[]> {
  return fetchAllBinderyPages<BinderyBook>((limit, offset) =>
    serviceRequest<unknown>("bindery", "/book", {
      params: { ...bookParams(query), limit, offset },
      instanceId,
    }),
  );
}


/**
 * Book detail. This is the only response that carries `bookFiles[]` and
 * `identifiers[]`.
 */
export function getBook(id: number, instanceId?: string): Promise<BinderyBook> {
  return serviceRequest<BinderyBook>("bindery", `/book/${id}`, { instanceId });
}

export function updateBook(
  id: number,
  payload: BinderyUpdateBookPayload,
  instanceId?: string,
): Promise<BinderyBook> {
  return serviceRequest<BinderyBook>("bindery", `/book/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    instanceId,
  });
}

export function deleteBook(
  id: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bindery", `/book/${id}`, {
    method: "DELETE",
    params: deleteFiles ? { deleteFiles: true } : undefined,
    instanceId,
  });
}

/**
 * Deletes an imported file. `format` destroys the file on disk; `path`
 * deregisters one tracked path without touching the disk.
 */
export function deleteBookFile(
  id: number,
  opts: { format?: "ebook" | "audiobook"; path?: string } = {},
  instanceId?: string,
): Promise<void> {
  const params: Record<string, string> = {};
  if (opts.format) params.format = opts.format;
  if (opts.path) params.path = opts.path;
  return serviceRequest<void>("bindery", `/book/${id}/file`, {
    method: "DELETE",
    params,
    instanceId,
  });
}

/** Toggles the "never search for this again" exclusion. Takes no body. */
export function toggleBookExcluded(
  id: number,
  instanceId?: string,
): Promise<BinderyBook> {
  return serviceRequest<BinderyBook>("bindery", `/book/${id}/exclude`, {
    method: "PUT",
    instanceId,
  });
}

/**
 * Manual indexer search. Fans out to every configured indexer synchronously,
 * so it needs the long interactive-search ceiling rather than the 15s default
 * — the same reason Radarr/Sonarr interactive search uses it.
 */
export function searchBook(
  id: number,
  instanceId?: string,
): Promise<{ results?: unknown[] }> {
  return serviceRequest<{ results?: unknown[] }>("bindery", `/book/${id}/search`, {
    method: "POST",
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

// --- Wanted ---
//
// Deliberately /book?status=wanted rather than /wanted/missing. They select the
// same rows (status=wanted forces monitored=1 and excludes excluded books), but
// /wanted/missing is an unpaginated bare array AND is never image-proxied — so
// rendering its covers would fetch them straight from the metadata provider and
// leak the user's device IP. The /book route is paged, proxied, and reports a
// real total for the dashboard badge.

export function getWantedBooks(instanceId?: string): Promise<BinderyBook[]> {
  // Newest release first, matching what the *arr wanted views show. `date-new`
  // is one of the server's whitelisted sort keys; anything else would be
  // silently ignored and fall back to title order.
  return getBooks({ status: "wanted", sort: "date-new" }, instanceId);
}

/** Cheap count for the widget badge: one row, read the envelope total. */
export async function getWantedCount(instanceId?: string): Promise<number> {
  const data = await serviceRequest<unknown>("bindery", "/book", {
    params: { status: "wanted", limit: 1, offset: 0 },
    instanceId,
  });
  return unwrapBinderyList<BinderyBook>(data).total;
}

// --- Queue ---

/**
 * The whole queue. `/queue` accepts no query parameters at all, so there is
 * nothing to page or filter server-side — callers filter and sort in JS.
 */
export function getQueue(instanceId?: string): Promise<BinderyQueueResponse> {
  return serviceRequest<BinderyQueueResponse>("bindery", "/queue", { instanceId });
}

/**
 * Removes queue items.
 *
 * Routed through bulk-delete even for a single id because only the bulk route
 * accepts `unmonitorBooks` — without it the scheduler's wanted-search loop
 * re-grabs the release almost immediately and the removal looks like it did
 * nothing. Defaults match the server's own (keep files, keep monitoring) so
 * the caller decides; the queue adapter maps *arr's `skipRedownload` onto it.
 *
 * There is no blocklist option on either removal route; blocklisting requires
 * a history id (the queue item's `guid` matches the grabbed history event's
 * `data.guid`, if that is ever wired up).
 */
export function removeFromQueue(
  ids: number[],
  opts: { deleteFiles?: boolean; unmonitorBooks?: boolean } = {},
  instanceId?: string,
): Promise<{ results?: Record<string, { ok: boolean; error?: string }> }> {
  return serviceRequest("bindery", "/queue/bulk-delete", {
    method: "POST",
    body: JSON.stringify({
      ids,
      deleteFiles: opts.deleteFiles ?? false,
      unmonitorBooks: opts.unmonitorBooks ?? false,
    }),
    headers: { "Content-Type": "application/json" },
    instanceId,
  });
}

/**
 * Retries a failed import without re-downloading. The server 409s this in
 * every state but `importFailed`, so gate the call with
 * binderyCanRetryImport() rather than surfacing the error.
 */
export function retryImport(
  queueId: number,
  instanceId?: string,
): Promise<{ ok?: boolean }> {
  return serviceRequest<{ ok?: boolean }>(
    "bindery",
    `/queue/${queueId}/retry-import`,
    { method: "POST", instanceId },
  );
}

// --- Reference data (add flow) ---

export async function getRootFolders(
  instanceId?: string,
): Promise<BinderyRootFolder[]> {
  const data = await serviceRequest<unknown>("bindery", "/rootfolder", {
    instanceId,
  });
  return unwrapBinderyList<BinderyRootFolder>(data).items;
}

export async function getMetadataProfiles(
  instanceId?: string,
): Promise<BinderyMetadataProfile[]> {
  const data = await serviceRequest<unknown>("bindery", "/metadataprofile", {
    instanceId,
  });
  return unwrapBinderyList<BinderyMetadataProfile>(data).items;
}

/**
 * Reads one install-level setting. The server answers 404 for a key that has
 * never been written, which is the normal case on a fresh install — callers
 * must treat a rejection as "unset" and fall back, and must not batch these
 * into a single Promise.all where one 404 would sink the rest.
 */
export async function getSetting(
  key: string,
  instanceId?: string,
): Promise<string | null> {
  try {
    const data = await serviceRequest<{ value?: string } | string>(
      "bindery",
      `/setting/${key}`,
      { instanceId },
    );
    if (typeof data === "string") return data;
    return data?.value ?? null;
  } catch {
    return null;
  }
}

// --- Metadata search (add flow) ---

/**
 * Searches the metadata provider for authors to add.
 *
 * The parameter is `term`. Bindery's own docs/API.md says `?q=`, but the
 * handler reads only `term` and 400s without it.
 *
 * Results are stubs: `id` is 0, and `imageUrl` is a raw remote URL or empty
 * because search responses are never image-proxied. They must not be routed
 * through useServiceImage.
 */
export async function searchAuthors(
  term: string,
  instanceId?: string,
): Promise<BinderyAuthorSearchResult[]> {
  const data = await serviceRequest<unknown>("bindery", "/search/author", {
    params: { term },
    instanceId,
  });
  return unwrapBinderyList<BinderyAuthorSearchResult>(data).items;
}

export { BINDERY_PAGE_LIMIT };
