import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackendStore } from "@/store/backend-store";
import { getBackendHealth } from "@/services/backend-api";

const HEALTH_INTERVAL_MS = 60000;

/**
 * Polls the paired backend's /health endpoint every 60s. Updates the backend
 * store's `isHealthy` flag (which the notification watchers read to decide
 * whether to short-circuit). No-ops until the backend is paired.
 */
export function useBackendHealth() {
  const url = useBackendStore((s) => s.url);
  const hydrated = useBackendStore((s) => s.hydrated);
  const setHealth = useBackendStore((s) => s.setHealth);

  const query = useQuery({
    queryKey: ["backendHealth", url],
    enabled: hydrated && !!url,
    queryFn: async () => {
      try {
        const h = await getBackendHealth();
        return h;
      } catch (err) {
        throw err;
      }
    },
    refetchInterval: HEALTH_INTERVAL_MS,
    retry: 0,
    staleTime: HEALTH_INTERVAL_MS,
  });

  useEffect(() => {
    if (!hydrated || !url) return;
    if (query.isFetching) return;
    if (query.data?.ok) {
      setHealth(true);
    } else if (query.isError) {
      setHealth(false);
    }
  }, [query.data, query.isError, query.isFetching, hydrated, url, setHealth]);

  return query;
}
