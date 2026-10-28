/**
 * Refresh data after work a server runs in the background.
 *
 * Some services acknowledge an action immediately and do the work later in a
 * job queue (Bazarr since 1.5.6: searches, downloads, sync, translate). The
 * acknowledgement says nothing about the outcome, so the UI must refresh the
 * affected data once the job is done. The queue doesn't say which job an
 * action created, so the watcher tracks the queue as a whole:
 *
 *   - `track(keys)` refreshes the keys at once (covers servers that finish
 *     the work before answering) and starts polling the active-job list;
 *   - every time a job leaves the list, tracked keys refresh again (several
 *     actions in a row each land as soon as their job ends);
 *   - once the list has been empty for two polls in a row, or `maxMs` passed,
 *     a final refresh runs and tracking stops.
 *
 * A server without a job list (`fetchActiveJobIds` resolves null) gets a few
 * timed refreshes instead.
 *
 * Pure: time and scheduling are injected, so it is tested with fake timers.
 */

export interface JobWatchOptions<K> {
  // Ids of the jobs currently pending or running; null when the server has no
  // job list. A rejection counts as "no information this tick".
  fetchActiveJobIds: () => Promise<number[] | null>;
  // Refresh what these keys stand for (e.g. invalidate React Query keys).
  refresh: (keys: K[]) => void;
  // Fires true when tracking starts and false when it stops, so the UI can
  // show work in progress (a spinner on the row the user acted on).
  onActiveChange?: (active: boolean) => void;
  schedule?: (fn: () => void, ms: number) => () => void;
  now?: () => number;
  intervalMs?: number;
  maxMs?: number;
  fallbackDelaysMs?: readonly number[];
  // Identity of a key, for deduplication. Defaults to JSON (array keys built
  // fresh on every call would otherwise never compare equal).
  keyId?: (key: K) => string;
}

export interface JobWatch<K> {
  track: (keys: K[]) => void;
  dispose: () => void;
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createJobWatch<K>({
  fetchActiveJobIds,
  refresh,
  onActiveChange,
  schedule = defaultSchedule,
  now = Date.now,
  intervalMs = 2000,
  maxMs = 120_000,
  fallbackDelaysMs = [3000, 10_000, 30_000],
  keyId = (key: K) => JSON.stringify(key),
}: JobWatchOptions<K>): JobWatch<K> {
  let tracked: K[] = [];
  const trackedIds = new Set<string>();
  let lastIds = new Set<number>();
  let emptyPolls = 0;
  let deadline = 0;
  let cancelTimer: (() => void) | null = null;
  let polling = false;
  let disposed = false;

  const stop = () => {
    cancelTimer?.();
    cancelTimer = null;
    if (polling) onActiveChange?.(false);
    polling = false;
    tracked = [];
    trackedIds.clear();
    lastIds = new Set();
    emptyPolls = 0;
  };

  const finish = () => {
    const keys = tracked;
    stop();
    if (keys.length > 0) refresh(keys);
  };

  const fallback = () => {
    const keys = tracked;
    stop();
    for (const delay of fallbackDelaysMs) {
      schedule(() => {
        if (!disposed) refresh(keys);
      }, delay);
    }
  };

  const tick = async () => {
    cancelTimer = null;
    if (disposed || tracked.length === 0) return stop();

    let ids: number[] | null | undefined;
    try {
      ids = await fetchActiveJobIds();
    } catch {
      ids = undefined; // transient: just try again next tick
    }
    if (disposed) return;
    if (ids === null) return fallback();

    if (ids !== undefined) {
      const current = new Set(ids);
      const someFinished = [...lastIds].some((id) => !current.has(id));
      lastIds = current;
      if (current.size === 0) {
        emptyPolls += 1;
        if (emptyPolls >= 2) return finish();
      } else {
        emptyPolls = 0;
      }
      if (someFinished) refresh(tracked);
    }

    if (now() >= deadline) return finish();
    cancelTimer = schedule(() => void tick(), intervalMs);
  };

  return {
    track(keys) {
      if (disposed || keys.length === 0) return;
      refresh(keys);
      for (const key of keys) {
        const id = keyId(key);
        if (!trackedIds.has(id)) {
          trackedIds.add(id);
          tracked.push(key);
        }
      }
      deadline = now() + maxMs;
      emptyPolls = 0;
      if (!polling) {
        polling = true;
        onActiveChange?.(true);
        cancelTimer = schedule(() => void tick(), intervalMs);
      }
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
