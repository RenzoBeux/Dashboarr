import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { lightHaptic } from "@/lib/haptics";
import { useManualRefresh } from "@/store/manual-refresh-store";

// The iOS UIRefreshControl (New Architecture / Fabric) retracts only when the
// native side observes a clean `refreshing: true -> false` transition — see
// RCTPullToRefreshViewComponentView.mm, which calls `endRefreshing` exactly on
// that diff. Two guards keep that transition reliable and bounded (#147):
//
//   MIN_SPIN_MS — hold the spinner for at least this long before flipping to
//     false, so the native `true` (begin animation) is guaranteed to land
//     before we send `false` (end). A very fast refetch that flips false within
//     the begin-animation window otherwise leaves the spinner visually pinned.
//
//   MAX_SPIN_MS — never let the spinner outlive a hung/unreachable service. A
//     keyless `invalidateQueries()` (the dashboard) — or a scoped refetch —
//     awaits every matching query's fetch to settle; with a 15s request abort +
//     retry:2 + exponential backoff, a single dead service takes ~50s, which is
//     exactly the "spinner never ends" the v1.8.1 fix never addressed (it only
//     cleared the spinner on blur). We cap the wait and let the refetch finish
//     in the background, so the cache still updates when the slow service lands.
const MIN_SPIN_MS = 600;
const MAX_SPIN_MS = 10000;

/**
 * Drives a pull-to-refresh spinner from an async refresh function with the
 * timing guards above, re-entrancy protection, and iOS focus/blur resets so a
 * spinner can never be stranded by a tab switch (react-native-screens detaches
 * blurred tab screens, which froze the native control mid-spin — #147).
 *
 * Shared by `usePullToRefresh` (TanStack invalidation) and the hand-rolled
 * torrent downloads view (custom refetch) so both get identical behavior.
 */
export function useRefreshSpinner(doRefresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether THIS hook instance currently holds a manual-refresh count, so
  // stop() decrements exactly once per pull. stop() also fires on blur/unmount
  // with no pull in flight, and a balanced begin/end keeps the global counter
  // honest no matter which teardown path runs first.
  const heldManualRefresh = useRef(false);

  const releaseManualRefresh = useCallback(() => {
    if (!heldManualRefresh.current) return;
    heldManualRefresh.current = false;
    useManualRefresh.getState().end();
  }, []);

  const stop = useCallback(() => {
    if (endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
    }
    running.current = false;
    releaseManualRefresh();
    if (mounted.current) setRefreshing(false);
  }, [releaseManualRefresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (endTimer.current) clearTimeout(endTimer.current);
      // Backstop: if the screen unmounts before stop() runs, don't leak a count.
      releaseManualRefresh();
    };
  }, [releaseManualRefresh]);

  // iOS: react-native-screens detaches a blurred tab screen. Clearing the
  // spinner (and any pending end-timer) on blur dismisses the native control
  // while the screen is still attached, so it can't come back frozen mid-spin.
  useFocusEffect(
    useCallback(() => {
      return () => stop();
    }, [stop]),
  );

  const onRefresh = useCallback(async () => {
    if (running.current) return; // ignore re-pulls while one is already in flight
    running.current = true;
    // Mark a user-initiated refresh in flight so widgets (the dashboard Services
    // tile) can show their own spinner during the pull but stay quiet on the 30s
    // background poll. Released in stop() / on teardown via releaseManualRefresh.
    if (!heldManualRefresh.current) {
      heldManualRefresh.current = true;
      useManualRefresh.getState().begin();
    }
    lightHaptic();
    setRefreshing(true);
    const startedAt = Date.now();

    let capTimer: ReturnType<typeof setTimeout> | null = null;
    const cap = new Promise<void>((resolve) => {
      capTimer = setTimeout(resolve, MAX_SPIN_MS);
    });

    try {
      // Bound the wait: whichever settles first wins. The refetch keeps running
      // after the cap — it just no longer holds the spinner hostage.
      await Promise.race([
        Promise.resolve(doRefresh()).catch(() => {}),
        cap,
      ]);
    } finally {
      if (capTimer) clearTimeout(capTimer);
      const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt));
      endTimer.current = setTimeout(stop, wait);
    }
  }, [doRefresh, stop]);

  return { refreshing, onRefresh };
}

/**
 * Pull-to-refresh tied to TanStack Query invalidation. Pass optional query keys
 * to invalidate only specific queries; omit them to invalidate everything (the
 * dashboard). Returns `{ refreshing, onRefresh }` for a RefreshControl.
 */
export function usePullToRefresh(queryKeys?: readonly unknown[][]) {
  const queryClient = useQueryClient();
  const doRefresh = useCallback(() => {
    if (queryKeys) {
      return Promise.all(
        queryKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
    }
    return queryClient.invalidateQueries();
  }, [queryClient, queryKeys]);

  return useRefreshSpinner(doRefresh);
}
