import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type DownloadId = string | number;

const NONE: ReadonlySet<DownloadId> = new Set();

/**
 * Ceiling on how long an id is held in the "settling" state below. The refresh
 * normally lands in one round trip, but lib/query-client.ts retries twice with
 * exponential backoff behind a 15s request timeout, so an unreachable server can
 * keep that promise pending for ~50s. Holding "downloading" that long would be a
 * worse lie than the red frame the hold exists to avoid, so time it out.
 */
export const SETTLE_MAX_MS = 3_000;

/** Ids present in `previous` that are gone from `current`. */
export function departedIds(
  previous: ReadonlySet<DownloadId>,
  current: ReadonlySet<DownloadId>,
): DownloadId[] {
  return [...previous].filter((id) => !current.has(id));
}

/**
 * Refresh the payloads that carry `hasFile` the moment a download finishes, and
 * hold the row purple until that refresh lands.
 *
 * `hasFile` is the only source of the green "downloaded" bar, and it lives in
 * the `/calendar` (or `/wanted`) response — which nothing in the app used to
 * invalidate: it rode a 60s poll. The download queue polls at 30s, so an episode
 * that finishes importing drops out of the downloading set well before the
 * calendar learns it has a file, and the row flashed back to *red* for up to a
 * minute instead of going purple → green (#401).
 *
 * Leaving the queue is the app's only observable proxy for "import finished" —
 * there's no SignalR client, and the REST episode resource never populates
 * `grabbed` — so watch for ids disappearing and invalidate right then.
 *
 * Invalidating alone still leaves a visible red window: the departure renders
 * `downloading: false` against the not-yet-refreshed `hasFile: false`, and the
 * replacement request takes a round trip to answer. So a departed id is also
 * held in the returned set until its refresh resolves (or SETTLE_MAX_MS
 * elapses), which keeps it purple across that gap. The hold runs in a *layout*
 * effect so the state lands before the frame is painted, not one frame after it.
 *
 * Returns the set to paint purple: everything still queued, plus everything
 * settling. Callers must keep passing the raw queue set in — feeding this return
 * value back would mask the very departure it detects.
 */
export function useRefreshOnDownloadComplete(
  downloading: ReadonlySet<DownloadId>,
  queryKeys: readonly (readonly unknown[])[],
): ReadonlySet<DownloadId> {
  const queryClient = useQueryClient();
  const previous = useRef(downloading);
  const [settling, setSettling] = useState<ReadonlySet<DownloadId>>(NONE);
  // Read the keys through a ref: callers build the list inline, and depending on
  // a fresh array identity would re-run the effect (and invalidate) every render.
  const keys = useRef(queryKeys);
  keys.current = queryKeys;

  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const departed = departedIds(previous.current, downloading);
    previous.current = downloading;
    if (!departed.length) return;

    setSettling((s) => new Set([...s, ...departed]));

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (!mounted.current) return;
      setSettling((s) => {
        const next = new Set(s);
        for (const id of departed) next.delete(id);
        return next.size ? next : NONE;
      });
    };
    const cap = setTimeout(release, SETTLE_MAX_MS);

    Promise.all(
      keys.current.map((queryKey) =>
        // Deliberately the default `cancelRefetch: true`. A fetch already in
        // flight was very likely issued *before* the import landed, so joining
        // it returns pre-import data — and its success clears `isInvalidated`,
        // so nothing refetches afterwards and the row stays red until the 60s
        // poll, which is the bug this hook exists to fix. Cancelling and
        // restarting guarantees at least one request begins after departure.
        // Callers pass the exact keys they observe, so this stays one request
        // per surface rather than a cross-matching stampede.
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
      .catch(() => {})
      .finally(() => {
        clearTimeout(cap);
        release();
      });
  }, [downloading, queryClient]);

  return useMemo(
    () => (settling.size ? new Set([...downloading, ...settling]) : downloading),
    [downloading, settling],
  );
}
