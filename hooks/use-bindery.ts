import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getAuthors,
  getAuthor,
  getBook,
  getWantedBooks,
  getQueue,
  addAuthor,
  updateAuthor,
  deleteAuthor,
  refreshAuthor,
  updateBook,
  deleteBook,
  deleteBookFile,
  toggleBookExcluded,
  searchBook,
  retryImport,
  getRootFolders,
  getMetadataProfiles,
  getSetting,
  searchAuthors,
  type BinderyAuthorQuery,
} from "@/services/bindery-api";
import { toast, toastError } from "@/components/ui/toast";
import type { BinderyAuthor, BinderyBook } from "@/lib/types";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: every hook accepts an optional `instanceId`. When
// omitted the user's active Bindery is used (single-instance behavior); when
// passed, queries fan out to that specific instance with its own cache slot.


// Drops anything that would not change the request, so callers that differ only
// cosmetically share one cache entry. `az` is the server's own fallback order
// for an unrecognised or absent `sort`, so sending it is a no-op — and without
// this the Books grid (sort: "az") and the author-search screen (no sort, it
// only needs the list to match titles against) would each walk the full library
// separately.
function normalizeAuthorQuery(query: BinderyAuthorQuery): BinderyAuthorQuery {
  const out: BinderyAuthorQuery = {};
  if (query.search) out.search = query.search;
  if (query.sort && query.sort !== "az") out.sort = query.sort;
  if (query.monitored !== undefined) out.monitored = query.monitored;
  return out;
}

export function useBinderyAuthors(
  query: BinderyAuthorQuery = {},
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  const normalized = normalizeAuthorQuery(query);
  return useQuery({
    queryKey: ["bindery", id, "authors", normalized],
    queryFn: () => getAuthors(normalized, id ?? undefined),
    enabled: enabled && !!id,
    // Sorting and filtering happen server-side, so a changed key means a new
    // request. Hold the previous page so the grid doesn't blank on every chip
    // tap (same reasoning as useRadarrSearch, #304).
    placeholderData: keepPreviousData,
  });
}

export function useBinderyAuthor(authorId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "author", authorId],
    queryFn: () => getAuthor(authorId, id ?? undefined),
    enabled: authorId > 0 && !!id,
  });
}


export function useBinderyBook(bookId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "book", bookId],
    queryFn: () => getBook(bookId, id ?? undefined),
    enabled: bookId > 0 && !!id,
  });
}

export function useBinderyQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "queue"],
    // Args must stay identical to binderyArrQueueAdapter.fetchQueue — the
    // dashboard widget and the queue-issues banner share this cache entry.
    // (Trivially satisfied here: /queue takes no parameters at all.)
    queryFn: () => getQueue(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

// The full wanted list for the Books tab's Wanted chip.
//
// Namespaced with "all" under the same ["bindery", id, "wanted"] prefix the
// dashboard badge owns, mirroring Lidarr. The nesting is load-bearing, not
// cosmetic: the queue-issues banner invalidates adapter.wantedQueryKey() after
// a removal so both the badge and this list refresh, and React Query matches
// that key as a PREFIX. A sibling key (["bindery", id, "wantedCount"]) would
// never be reached and the Wanted tab would sit stale until the 30s poll.
export function useBinderyWanted(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "wanted", "all"],
    queryFn: () => getWantedBooks(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useBinderyRootFolders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "rootfolders"],
    queryFn: () => getRootFolders(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useBinderyMetadataProfiles(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "metadataprofiles"],
    queryFn: () => getMetadataProfiles(id ?? undefined),
    enabled: enabled && !!id,
  });
}

/**
 * Reads one install-level Bindery setting, or null when it has never been set
 * (the server answers 404 in that case, which getSetting swallows). Each key
 * gets its own query so one unset key cannot sink the others.
 */
export function useBinderySetting(key: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "setting", key],
    queryFn: () => getSetting(key, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBinderyAuthorSearch(term: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bindery", instanceId);
  return useQuery({
    queryKey: ["bindery", id, "search", term],
    queryFn: () => searchAuthors(term, id ?? undefined),
    enabled: enabled && term.length >= 2 && !!id,
    // Hold the last results while the next term loads (#304).
    placeholderData: keepPreviousData,
  });
}

// --- Mutations ---

export function useAddBinderyAuthor(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: (payload: Parameters<typeof addAuthor>[0]) =>
      addAuthor(payload, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "authors"] });
    },
  });
}

export function useUpdateBinderyAuthor(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: ({
      authorId,
      payload,
    }: {
      authorId: number;
      payload: Parameters<typeof updateAuthor>[1];
    }) => updateAuthor(authorId, payload, id ?? undefined),
    // Only `monitored` is worth an optimistic update — the profile and
    // root-folder fields aren't rendered anywhere that would flicker.
    onMutate: async ({ authorId, payload }) => {
      if (payload.monitored === undefined) return {};
      const monitored = payload.monitored;
      await queryClient.cancelQueries({ queryKey: ["bindery", id, "author", authorId] });

      const prevDetail = queryClient.getQueryData<BinderyAuthor>([
        "bindery",
        id,
        "author",
        authorId,
      ]);
      if (prevDetail) {
        queryClient.setQueryData<BinderyAuthor>(
          ["bindery", id, "author", authorId],
          { ...prevDetail, monitored },
        );
      }
      return { prevDetail };
    },
    onError: (err, { authorId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(["bindery", id, "author", authorId], context.prevDetail);
      }
      toastError("Failed to update author", err);
    },
    onSettled: (_data, _err, { authorId }) => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "authors"] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "author", authorId] });
    },
  });
}

export function useDeleteBinderyAuthor(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: ({
      authorId,
      deleteFiles = false,
    }: {
      authorId: number;
      deleteFiles?: boolean;
    }) => deleteAuthor(authorId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "authors"] });
    },
    // No onError here on purpose: the detail screen passes its own so it can
    // keep the user on the page instead of popping. TanStack v5 runs both the
    // hook-level and call-level callbacks, so a second one would stack a
    // duplicate toast. Mirrors useDeleteMovie.
  });
}

export function useRefreshBinderyAuthor(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: (authorId: number) => refreshAuthor(authorId, id ?? undefined),
    onSuccess: (_data, authorId) => {
      toast("Refreshing metadata");
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "author", authorId] });
    },
    onError: (err) => toastError("Refresh failed", err),
  });
}

export function useToggleBinderyBookMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    // Send `monitored` and nothing else. Including any of title, description,
    // genres, language or releaseDate would also LOCK that field against
    // future metadata refreshes, which is not what a monitor toggle means.
    mutationFn: ({ bookId, monitored }: { bookId: number; monitored: boolean }) =>
      updateBook(bookId, { monitored }, id ?? undefined),
    onMutate: async ({ bookId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["bindery", id, "book", bookId] });
      const prevDetail = queryClient.getQueryData<BinderyBook>([
        "bindery",
        id,
        "book",
        bookId,
      ]);
      if (prevDetail) {
        queryClient.setQueryData<BinderyBook>(
          ["bindery", id, "book", bookId],
          { ...prevDetail, monitored },
        );
      }
      return { prevDetail };
    },
    onError: (err, { bookId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(["bindery", id, "book", bookId], context.prevDetail);
      }
      toastError("Failed to update monitoring", err);
    },
    onSettled: (_data, _err, { bookId }) => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "books"] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "wanted"] });
    },
  });
}

export function useDeleteBinderyBook(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: ({
      bookId,
      deleteFiles = false,
    }: {
      bookId: number;
      deleteFiles?: boolean;
    }) => deleteBook(bookId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "books"] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "wanted"] });
    },
    // See useDeleteBinderyAuthor: the caller owns the error toast.
  });
}

/**
 * Deletes an imported file. `format` destroys it on disk; `path` only
 * deregisters one tracked path, leaving the file alone.
 */
export function useDeleteBinderyBookFile(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: ({
      bookId,
      format,
      path,
    }: {
      bookId: number;
      format?: "ebook" | "audiobook";
      path?: string;
    }) => deleteBookFile(bookId, { format, path }, id ?? undefined),
    onSuccess: (_data, { bookId }) => {
      toast("File deleted");
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "books"] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "wanted"] });
    },
    onError: (err) => toastError("Failed to delete file", err),
  });
}

export function useToggleBinderyBookExcluded(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: (bookId: number) => toggleBookExcluded(bookId, id ?? undefined),
    onSuccess: (_data, bookId) => {
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "book", bookId] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "books"] });
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "wanted"] });
    },
    onError: (err) => toastError("Failed to update exclusion", err),
  });
}

export function useSearchBinderyBook(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: (bookId: number) => searchBook(bookId, id ?? undefined),
    onSuccess: (data) => {
      const count = data?.results?.length ?? 0;
      toast(count > 0 ? `Found ${count} release${count === 1 ? "" : "s"}` : "No releases found");
    },
    onError: (err) => toastError("Search failed", err),
  });
}


export function useRetryBinderyImport(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bindery", instanceId);
  return useMutation({
    mutationFn: (queueId: number) => retryImport(queueId, id ?? undefined),
    onSuccess: () => {
      toast("Retrying import");
      queryClient.invalidateQueries({ queryKey: ["bindery", id, "queue"] });
    },
    onError: (err) => toastError("Retry failed", err),
  });
}
