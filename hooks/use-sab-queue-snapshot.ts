import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { notifyManager, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSabQueue } from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { retryQuery } from "@/lib/query-client";
import {
  SabQueueChangedError,
  mergeSabQueue,
  readSabQueueSnapshot,
  sabPageEndsQueue,
  sabQueuePageKey,
  sabQueuePageRequest,
  sabQueuePagesKey,
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
  // The last read of the whole queue failed. Before any good read the rows
  // are the first page (complete is false); after one they are that read,
  // possibly out of date. Either way it is read again on its own, as often as
  // a changing queue would be, or now with retryRead.
  readError: Error | null;
  // A read of the whole queue is running.
  reading: boolean;
  retryRead: () => void;
  // Pull-to-refresh: the polled pages and a fresh whole-queue read.
  refetch: () => Promise<unknown>;
}

// readSabQueueSnapshot already tried three times when the queue kept
// changing; anything else (a dropped request) gets the app's usual retries.
const retrySnapshot = (failureCount: number, error: Error) =>
  !(error instanceof SabQueueChangedError) && retryQuery(failureCount, error);

/**
 * Every read of this queue's pages in the cache, whichever screen polls it.
 * The list polls the pages on screen and a job's detail polls the job's page;
 * both show the queue from all of them, so they show the same numbers.
 */
function useCachedPageReads(id: string | null, status: string[] | undefined): SabPageRead[] {
  const cache = useQueryClient().getQueryCache();
  const statusKey = status?.join(",");
  const prefix = useMemo(
    () => sabQueuePagesKey(id, status),
    // statusKey stands for `status`, which callers rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, statusKey],
  );
  // As useIsFetching does: deferred, so no screen updates while another renders.
  const subscribe = useCallback(
    (onChange: () => void) => cache.subscribe(notifyManager.batchCalls(onChange)),
    [cache],
  );
  const version = useSyncExternalStore(subscribe, () =>
    cache
      .findAll({ queryKey: prefix })
      .map((q) => `${String(q.queryKey[prefix.length])}:${q.state.dataUpdatedAt}`)
      .join(),
  );
  return useMemo(
    () =>
      cache.findAll({ queryKey: prefix }).flatMap((q) => {
        const queue = q.state.data as SabQueue | undefined;
        const page = q.queryKey[prefix.length];
        return queue && typeof page === "number"
          ? [{ page, queue, readAt: q.state.dataUpdatedAt }]
          : [];
      }),
    // `version` changes whenever a page's data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, prefix, version],
  );
}

/**
 * SABnzbd's queue for the Downloads list and the job detail (#514). The first
 * page and the pages on screen poll every 5 s, SAB_QUEUE_PAGE_SIZE jobs each.
 * The whole queue is read once (readSabQueueSnapshot), then again soon when a
 * polled page shows it changed or the last read failed, and otherwise at a
 * max age (sabSnapshotNeedsRead), and after any SAB mutation, which
 * invalidates the instance's queries. Sorts and filters see every job, and the
 * list and the detail show the same numbers.
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
    // Re-read by sabSnapshotNeedsRead (below) or an invalidation.
    staleTime: Infinity,
    retry: retrySnapshot,
  });
  const snapshot = snapshotQuery.data;
  const snapshotReadAt = snapshotQuery.dataUpdatedAt;
  const reads = useCachedPageReads(id, status);

  const needsRead =
    active &&
    !!head.data &&
    !headIsWhole &&
    sabSnapshotNeedsRead(snapshot, snapshotReadAt, snapshotQuery.errorUpdatedAt, reads, Date.now());
  const { refetch: refetchSnapshot, isFetching: snapshotFetching } = snapshotQuery;
  // The list and a job's detail can both be mounted and notice the same
  // change: the second joins the first read instead of cancelling it.
  useEffect(() => {
    if (needsRead && !snapshotFetching) void refetchSnapshot({ cancelRefetch: false });
  }, [needsRead, snapshotFetching, refetchSnapshot]);

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
    // TanStack keeps the error through a retry once there is data, and clears
    // it at the start of one while there is none, so the list shows the
    // failure next to the stale rows, or its spinner while the rest loads.
    readError: headIsWhole ? null : snapshotQuery.error,
    reading: snapshotFetching,
    retryRead,
    refetch,
  };
}
