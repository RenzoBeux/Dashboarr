/**
 * Aggregate display state for a multi-instance widget that fans a query out
 * across N instances via TanStack Query's `useQueries`.
 *
 * The naive aggregation is `queries.some((q) => q.isLoading)`, but that flickers
 * the widget into a skeleton whenever a single instance is failing — its retries
 * keep `isLoading=true` for ~30s on cold start, hiding data the other instances
 * have already returned. This helper resolves the right gate: render data as
 * soon as any instance has it, only show the skeleton when nothing has loaded
 * yet, and only surface the error UI when every instance has errored without
 * ever returning data.
 *
 * "Errored" has to outlive the error itself. TanStack resets a query that holds
 * no data back to `status: "pending"` (and clears `error`) the moment a refetch
 * starts, so an unreachable instance polling every 5s reads as `isError` while
 * idle and as `isLoading` while in flight, which is indistinguishable from a
 * first load by those two flags alone. Gating on them made single-instance
 * widgets flip between their empty row and the full-height skeleton on every
 * poll (#400). `errorUpdateCount` is the one field the reset leaves alone, so a
 * data-less query that has failed at least once stays "errored" here until it
 * actually succeeds.
 */
export interface MultiInstanceQueryLike<T = unknown> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  /** TanStack's running count of error results; a refetch never resets it. */
  errorUpdateCount?: number;
}

export interface MultiInstanceState {
  hasAnyData: boolean;
  isInitialLoading: boolean;
  isAllErrored: boolean;
}

// A query with nothing to render that has failed at least once, whether it is
// sitting in its error state or part-way through the next attempt.
function hasFailedWithoutData(q: MultiInstanceQueryLike): boolean {
  return q.data === undefined && (q.isError || (q.errorUpdateCount ?? 0) > 0);
}

export function aggregateMultiInstanceState(
  queries: readonly MultiInstanceQueryLike[],
): MultiInstanceState {
  if (queries.length === 0) {
    return { hasAnyData: false, isInitialLoading: false, isAllErrored: false };
  }
  const hasAnyData = queries.some((q) => q.data !== undefined);
  const isAllErrored = !hasAnyData && queries.every(hasFailedWithoutData);
  const isInitialLoading =
    !hasAnyData &&
    !isAllErrored &&
    queries.some((q) => q.isLoading && !hasFailedWithoutData(q));
  return { hasAnyData, isInitialLoading, isAllErrored };
}
