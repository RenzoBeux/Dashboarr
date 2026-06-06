import { QueryClient } from "@tanstack/react-query";

// Auth failures (401/403) mean the API key/token is wrong, not that the network
// is flaky — retrying just burns JS-thread cycles and delays the error state.
// Skip retries for those; keep 2 retries (with backoff) for transient errors.
// Status is duck-typed (HttpError carries a numeric `status`) rather than
// imported, to avoid a require cycle: http-client imports the config store,
// which imports this module.
function retryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401 || status === 403) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryQuery,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      staleTime: 5000,
      gcTime: 300000,
      // The app polls on its own intervals and offers pull-to-refresh, so the
      // default "refetch every query on focus/reconnect" just causes a
      // thundering herd of refetches + re-renders each time the app resumes or
      // the network blips. Opt out; the active screen's polling keeps it fresh.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
