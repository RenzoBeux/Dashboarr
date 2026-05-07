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
 */
export interface MultiInstanceQueryLike<T = unknown> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface MultiInstanceState {
  hasAnyData: boolean;
  isInitialLoading: boolean;
  isAllErrored: boolean;
}

export function aggregateMultiInstanceState(
  queries: readonly MultiInstanceQueryLike[],
): MultiInstanceState {
  if (queries.length === 0) {
    return { hasAnyData: false, isInitialLoading: false, isAllErrored: false };
  }
  const hasAnyData = queries.some((q) => q.data !== undefined);
  const isAllErrored = !hasAnyData && queries.every((q) => q.isError);
  const isInitialLoading =
    !hasAnyData && !isAllErrored && queries.some((q) => q.isLoading);
  return { hasAnyData, isInitialLoading, isAllErrored };
}
