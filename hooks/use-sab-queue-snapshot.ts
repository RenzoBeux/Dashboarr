import { useCallback, useEffect, useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSabQueue } from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  mergeSabQueue,
  readSabQueueSnapshot,
  sabPageEndsQueue,
  sabQueuePageKey,
  sabQueuePageRequest,
  sabQueueSnapshotKey,
  sabSnapshotNeedsRead,
  type SabPageRead,
  type SabQueueQuery,
} from "@/lib/sab-queue-snapshot";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type { SabQueue } from "@/lib/types";

export interface SabQueueSnapshotOptions {
  // SAB-side status filter (e.g. ["Paused"]).
  status?: string[];
  // Pages with rows on screen. They poll with the first page.
  livePages: readonly number[];
  enabled?: boolean;
}

export interface SabQueueSnapshotView {
  // The whole queue, with live values and queue-wide ETAs (mergeSabQueue).
  queue?: SabQueue;
  // False while only the first page is in: the whole-queue read is running,
  // or failed (readError).
  complete: boolean;
  isLoading: boolean;
  // The first page failed. Shown only when there are no rows.
  error: Error | null;
  // Reading the whole queue failed; the rows already shown stay.
  readError: Error | null;
  retryRead: () => void;
  // Pull-to-refresh: the polled pages and a fresh whole-queue read.
  refetch: () => Promise<unknown>;
}

/**
 * SABnzbd's queue for the Downloads list and the job detail (#514). The first
 * page and the pages on screen poll every 5 s, SAB_QUEUE_PAGE_SIZE jobs each.
 * The whole queue is read once (readSabQueueSnapshot), then again only when a
 * polled page shows it changed (sabSnapshotNeedsRead), and after any SAB
 * mutation, which invalidates the instance's queries. Sorts and filters see
 * every job, and the list and the detail show the same numbers.
 */
export function useSabQueueSnapshot(
  instanceId: string | undefined,
  { status, livePages, enabled = true }: SabQueueSnapshotOptions,
): SabQueueSnapshotView {
  const { instanceId: id, enabled: ready } = useInstanceTarget("sabnzbd", instanceId);
  const queryClient = useQueryClient();
  const active = ready && !!id && enabled;
  const statusFiltered = !!status?.length;
  const read = useCallback(
    (query: SabQueueQuery) => getSabQueue(id ?? undefined, query),
    [id],
  );

  const pages = useMemo(
    () => [0, ...new Set(livePages.filter((p) => p > 0))],
    [livePages],
  );
  const pageResults = useQueries({
    queries: pages.map((page) => ({
      queryKey: sabQueuePageKey(id, status, page),
      queryFn: () => read({ ...sabQueuePageRequest(page), status }),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: active,
    })),
  });
  const head = pageResults[0];
  const headIsWhole = !!head.data && sabPageEndsQueue(head.data, 0, statusFiltered);

  const snapshotQuery = useQuery({
    queryKey: sabQueueSnapshotKey(id, status),
    queryFn: ({ signal }) =>
      readSabQueueSnapshot(
        read,
        status,
        queryClient.getQueryData<SabQueue>(sabQueuePageKey(id, status, 0)),
        signal,
      ),
    // Not needed while the first page holds the whole queue.
    enabled: active && !!head.data && !headIsWhole,
    // Re-read on a detected change (below) or an invalidation, never by age.
    staleTime: Infinity,
  });
  const snapshot = snapshotQuery.data;
  const snapshotReadAt = snapshotQuery.dataUpdatedAt;

  const readsKey = pageResults.map((r, i) => `${pages[i]}:${r.dataUpdatedAt}`).join();
  const reads = useMemo<SabPageRead[]>(
    () =>
      pageResults.flatMap((r, i) =>
        r.data ? [{ page: pages[i], queue: r.data, readAt: r.dataUpdatedAt }] : [],
      ),
    // readsKey changes whenever a page's data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readsKey],
  );

  const needsRead =
    !!snapshot && !headIsWhole && sabSnapshotNeedsRead(snapshot, snapshotReadAt, reads, Date.now());
  const { refetch: refetchSnapshot, isFetching: snapshotFetching } = snapshotQuery;
  // After a failed read the list's Retry (or the next mutation) reads again,
  // not a loop against a failing server. The list and a job's detail can both
  // be mounted and notice the same change: the second joins the first read
  // instead of cancelling it for a new one.
  const readFailed = snapshotQuery.status === "error";
  useEffect(() => {
    if (needsRead && !snapshotFetching && !readFailed) {
      void refetchSnapshot({ cancelRefetch: false });
    }
  }, [needsRead, snapshotFetching, readFailed, refetchSnapshot]);

  const merged = useMemo(
    () => mergeSabQueue(snapshot, snapshotReadAt, reads, statusFiltered),
    [snapshot, snapshotReadAt, reads, statusFiltered],
  );

  const retryRead = useCallback(() => {
    void refetchSnapshot({ cancelRefetch: false });
  }, [refetchSnapshot]);
  const refetch = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id, "queue", "page"] }),
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id, "queue", "snapshot"] }),
      ]),
    [queryClient, id],
  );

  return {
    queue: merged?.queue,
    complete: merged?.complete ?? false,
    isLoading: head.isLoading,
    error: head.error,
    readError: snapshotFetching ? null : snapshotQuery.error,
    retryRead,
    refetch,
  };
}
