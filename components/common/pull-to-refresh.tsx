import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lightHaptic } from "@/lib/haptics";

/**
 * Hook that provides pull-to-refresh state tied to TanStack Query invalidation.
 * Pass optional query keys to only invalidate specific queries.
 */
export function usePullToRefresh(queryKeys?: string[][]) {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const onRefresh = useCallback(async () => {
    lightHaptic();
    setRefreshing(true);
    try {
      if (queryKeys) {
        await Promise.all(
          queryKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          ),
        );
      } else {
        await queryClient.invalidateQueries();
      }
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, queryKeys]);

  return { refreshing, onRefresh };
}
