import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Refresh the payloads that carry `hasFile` the moment a download finishes.
 *
 * `hasFile` is the only source of the green "downloaded" bar, and it lives in
 * the `/calendar` (or `/wanted`) response — which nothing in the app has ever
 * invalidated: it rides a 60s poll. The download queue polls at 30s, so an
 * episode that finishes importing drops out of the downloading set well before
 * the calendar learns it has a file, and the row flashes back to *red* for up
 * to a minute instead of going purple → green (#401).
 *
 * Leaving the queue is the app's only observable proxy for "import finished" —
 * there's no SignalR client, and the REST episode resource never populates
 * `grabbed` — so watch for ids disappearing from `downloading` and invalidate
 * right then. Costs one extra fetch per completed download.
 */
export function useRefreshOnDownloadComplete(
  downloading: ReadonlySet<string | number>,
  queryKeys: readonly unknown[][],
): void {
  const queryClient = useQueryClient();
  const previous = useRef(downloading);
  // Read the keys through a ref: callers build the list inline, and depending on
  // a fresh array identity would re-run the effect (and invalidate) every render.
  const keys = useRef(queryKeys);
  keys.current = queryKeys;

  useEffect(() => {
    const settled = [...previous.current].some((id) => !downloading.has(id));
    previous.current = downloading;
    if (!settled) return;
    for (const queryKey of keys.current) {
      // `cancelRefetch: false` because several calendar surfaces can be mounted
      // at once and all observe the same queue: they invalidate overlapping key
      // prefixes in the same commit, and the default would abort each in-flight
      // calendar request and start it over. getCalendar forwards no AbortSignal,
      // so those cancelled requests still run server-side, just discarded. This
      // way the later invalidations join the fetch already in flight.
      queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
    }
  }, [downloading, queryClient]);
}
