import { QueryClient, QueryObserver } from "@tanstack/query-core";
import {
  aggregateMultiInstanceState,
  type MultiInstanceQueryLike,
} from "./multi-instance-query";

// Snapshots of the TanStack result shapes a fan-out widget sees. The two that
// matter for #400 are `errored` and `erroredRefetching`: a query with no data
// is reset to `pending` when its next poll starts, so the only thing telling a
// failing instance apart from a first load is `errorUpdateCount`.
const firstLoad: MultiInstanceQueryLike = {
  data: undefined,
  isLoading: true,
  isError: false,
  errorUpdateCount: 0,
};
const errored: MultiInstanceQueryLike = {
  data: undefined,
  isLoading: false,
  isError: true,
  errorUpdateCount: 1,
};
const erroredRefetching: MultiInstanceQueryLike = {
  data: undefined,
  isLoading: true,
  isError: false,
  errorUpdateCount: 1,
};
const loadedEmpty: MultiInstanceQueryLike = {
  data: [],
  isLoading: false,
  isError: false,
  errorUpdateCount: 0,
};

describe("aggregateMultiInstanceState", () => {
  it("reports nothing for an empty fan-out", () => {
    expect(aggregateMultiInstanceState([])).toEqual({
      hasAnyData: false,
      isInitialLoading: false,
      isAllErrored: false,
    });
  });

  it("shows the skeleton while every instance is on its first load", () => {
    expect(aggregateMultiInstanceState([firstLoad, firstLoad])).toEqual({
      hasAnyData: false,
      isInitialLoading: true,
      isAllErrored: false,
    });
  });

  it("treats an empty successful payload as data, not as loading", () => {
    expect(aggregateMultiInstanceState([loadedEmpty])).toEqual({
      hasAnyData: true,
      isInitialLoading: false,
      isAllErrored: false,
    });
  });

  it("is all-errored once every instance has failed without data", () => {
    expect(aggregateMultiInstanceState([errored, errored])).toEqual({
      hasAnyData: false,
      isInitialLoading: false,
      isAllErrored: true,
    });
  });

  it("keeps a failed instance errored while its next poll is in flight (#400)", () => {
    // Before the fix this read as isInitialLoading=true, so a single unreachable
    // server flipped its widget between the empty row and the skeleton every poll.
    expect(aggregateMultiInstanceState([erroredRefetching])).toEqual({
      hasAnyData: false,
      isInitialLoading: false,
      isAllErrored: true,
    });
  });

  it("still shows the skeleton when a sibling has never settled", () => {
    expect(aggregateMultiInstanceState([erroredRefetching, firstLoad])).toEqual({
      hasAnyData: false,
      isInitialLoading: true,
      isAllErrored: false,
    });
  });

  it("renders data from any instance regardless of failing siblings", () => {
    expect(aggregateMultiInstanceState([loadedEmpty, erroredRefetching])).toEqual({
      hasAnyData: true,
      isInitialLoading: false,
      isAllErrored: false,
    });
  });

  it("falls back to isError when errorUpdateCount is absent", () => {
    const legacyErrored = { data: undefined, isLoading: false, isError: true };
    const legacyLoading = { data: undefined, isLoading: true, isError: false };
    expect(aggregateMultiInstanceState([legacyErrored]).isAllErrored).toBe(true);
    expect(aggregateMultiInstanceState([legacyLoading]).isInitialLoading).toBe(true);
  });
});

describe("aggregateMultiInstanceState against a real QueryClient", () => {
  it("stays errored across the pending reset a refetch performs on a failed query", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = new QueryObserver(client, {
      queryKey: ["jellyfin", "home", "sessions"],
      queryFn: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(aggregateMultiInstanceState([observer.getCurrentResult()])).toEqual({
        hasAnyData: false,
        isInitialLoading: true,
        isAllErrored: false,
      });

      const settled = await observer.refetch();
      expect(settled.isError).toBe(true);
      expect(aggregateMultiInstanceState([settled])).toEqual({
        hasAnyData: false,
        isInitialLoading: false,
        isAllErrored: true,
      });

      // The next poll fires. Capture the result mid-flight: this is the state
      // TanStack hands the widget every 5s for an unreachable server.
      const inFlight = observer.refetch();
      const mid = observer.getCurrentResult();
      expect(mid.status).toBe("pending");
      expect(mid.isLoading).toBe(true);
      expect(mid.isError).toBe(false);
      expect(mid.errorUpdateCount).toBe(1);
      expect(aggregateMultiInstanceState([mid])).toEqual({
        hasAnyData: false,
        isInitialLoading: false,
        isAllErrored: true,
      });

      const again = await inFlight;
      expect(aggregateMultiInstanceState([again])).toEqual({
        hasAnyData: false,
        isInitialLoading: false,
        isAllErrored: true,
      });
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});
