import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { lightHaptic } from "@/lib/haptics";

/**
 * Hook that provides pull-to-refresh state tied to TanStack Query invalidation.
 * Pass optional query keys to only invalidate specific queries.
 */
export function usePullToRefresh(queryKeys?: readonly unknown[][]) {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // iOS: react-native-screens detaches/freezes a blurred tab screen. If a
  // pull-to-refresh is still in flight when the user switches tabs, the native
  // UIRefreshControl is frozen mid-spin and never receives the later
  // endRefreshing() once the invalidate resolves off-screen — it comes back
  // visible-but-frozen (#147). Clearing `refreshing` on blur drives the
  // control's prop to false while the screen is still attached, dismissing the
  // spinner before detach. The in-flight invalidate keeps running regardless.
  useFocusEffect(
    useCallback(() => {
      return () => setRefreshing(false);
    }, []),
  );

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
