import { QueryClient, QueryObserver } from "@tanstack/query-core";

/**
 * Pins the invalidation semantics `useRefreshOnDownloadComplete` depends on.
 *
 * The hook fires when an id leaves the *arr download queue, which is the app's
 * only signal that an import finished and `hasFile` flipped. If a calendar
 * request is already in flight at that moment it was issued *before* the
 * import, so joining it (`cancelRefetch: false`) hands back pre-import data —
 * and TanStack's success reducer clears `isInvalidated`, so nothing refetches
 * afterwards and the row stays red until the 60s poll. The hook must therefore
 * use the default `cancelRefetch: true` (#401).
 */
describe("invalidating a calendar query while a fetch is in flight", () => {
  const KEY = ["sonarr", "home", "calendar", 7];

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  function setup() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // What the server would return: false before the import, true after.
    let hasFile = false;
    // Values served per call, so we can see which fetches actually ran.
    const served: boolean[] = [];
    const gates: ReturnType<typeof deferred>[] = [];

    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: async () => {
        const value = hasFile;
        served.push(value);
        const gate = gates.shift();
        if (gate) await gate.promise;
        return { hasFile: value };
      },
    });

    return {
      client,
      observer,
      served,
      /** Make the next fetch hang until the returned handle is resolved. */
      hold: () => {
        const gate = deferred();
        gates.push(gate);
        return gate;
      },
      import: () => {
        hasFile = true;
      },
    };
  }

  it("cancelRefetch: false swallows the refresh, leaving pre-import data cached", async () => {
    const s = setup();
    const unsubscribe = s.observer.subscribe(() => {});
    try {
      await s.observer.refetch();
      expect(s.observer.getCurrentResult().data).toEqual({ hasFile: false });

      // A poll starts and hangs; the import lands while it is still open.
      const gate = s.hold();
      const inFlight = s.observer.refetch();
      s.import();

      const invalidated = s.client.invalidateQueries(
        { queryKey: KEY },
        { cancelRefetch: false },
      );
      gate.resolve();
      await inFlight;
      await invalidated;

      // Only the two stale fetches ever ran, and the second one's success
      // cleared isInvalidated, so nothing is left to pick up the import.
      expect(s.served).toEqual([false, false]);
      expect(s.observer.getCurrentResult().data).toEqual({ hasFile: false });
      expect(
        s.client.getQueryCache().find({ queryKey: KEY })?.state.isInvalidated,
      ).toBe(false);
    } finally {
      unsubscribe();
      s.client.clear();
    }
  });

  it("the default cancelRefetch starts a fresh fetch and picks up the import", async () => {
    const s = setup();
    const unsubscribe = s.observer.subscribe(() => {});
    try {
      await s.observer.refetch();

      const gate = s.hold();
      s.observer.refetch().catch(() => {});
      s.import();

      // Cancels the stale in-flight fetch and starts a new one.
      await s.client.invalidateQueries({ queryKey: KEY });

      expect(s.served).toEqual([false, false, true]);
      expect(s.observer.getCurrentResult().data).toEqual({ hasFile: true });
      gate.resolve();
    } finally {
      unsubscribe();
      s.client.clear();
    }
  });
});
