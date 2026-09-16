import { useCallback, useEffect, useRef, useState } from "react";
import type { Overview } from "../../../src/ui/overview-types";
import { ApiError, getOverview } from "../api";

const POLL_MS = 15_000;

interface Options {
  onUnauthenticated: () => void;
}

/**
 * Polls /ui/api/overview on a setTimeout chain (never overlapping requests),
 * pauses while the tab is hidden and refetches the moment it is visible
 * again. Errors other than 401 keep the last good data and surface as
 * `error` so the header can show a "stale" pill.
 */
export function useOverview({ onUnauthenticated }: Options) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const timer = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const unauth = useRef(onUnauthenticated);
  unauth.current = onUnauthenticated;

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const load = useCallback(async () => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    clearTimer();
    setRefreshing(true);
    try {
      const next = await getOverview(ac.signal);
      if (ac.signal.aborted) return;
      setData(next);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) {
        unauth.current();
        return;
      }
      setError(err instanceof ApiError ? err.code : "network");
    } finally {
      if (!ac.signal.aborted) {
        setRefreshing(false);
        if (document.visibilityState === "visible") {
          timer.current = window.setTimeout(() => void load(), POLL_MS);
        }
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
      else clearTimer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
      controller.current?.abort();
    };
  }, [load]);

  return { data, error, lastUpdatedAt, refreshing, refresh: load };
}
