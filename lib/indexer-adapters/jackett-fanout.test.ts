import {
  combineIndexerSearches,
  type IndexerSearchSlice,
} from "@/lib/indexer-adapters/jackett-fanout";
import type { UnifiedRelease } from "@/lib/indexer-adapter";

function release(id: string, seeders?: number): UnifiedRelease {
  return {
    id,
    title: id,
    indexer: "T",
    sizeBytes: 1,
    seeders,
    protocol: "torrent",
  };
}

function done(name: string, releases: UnifiedRelease[]): IndexerSearchSlice {
  return { name, pending: false, releases };
}

function failed(name: string, error: string): IndexerSearchSlice {
  return { name, pending: false, error };
}

const PENDING: IndexerSearchSlice = { name: "Slow", pending: true };

describe("combineIndexerSearches", () => {
  it("merges settled slices and sorts by seeders, missing counts last", () => {
    const out = combineIndexerSearches([
      done("A", [release("a1", 5), release("a2")]),
      done("B", [release("b1", 80)]),
    ]);
    expect(out).toMatchObject({ isLoading: false, isError: false, error: null });
    expect(out.data?.map((r) => r.id)).toEqual(["b1", "a1", "a2"]);
  });

  // A hung tracker must not hold the fast ones' releases hostage — that was
  // the whole point of fanning out (#314).
  it("exposes partial results while other indexers are still pending", () => {
    const out = combineIndexerSearches([done("A", [release("a1", 5)]), PENDING]);
    expect(out.isLoading).toBe(true);
    expect(out.isError).toBe(false);
    expect(out.data?.map((r) => r.id)).toEqual(["a1"]);
  });

  // data must stay undefined here: [] would render "No results" while the
  // search is still running.
  it("keeps data undefined while pending with nothing to show yet", () => {
    const out = combineIndexerSearches([PENDING, failed("B", "boom")]);
    expect(out).toEqual({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
  });

  it("aggregates failures into one error only when nothing came back", () => {
    const out = combineIndexerSearches([
      failed("A", "Timed out"),
      failed("B", "403 Forbidden"),
      done("C", []),
    ]);
    expect(out.isError).toBe(true);
    expect(out.error?.message).toBe("2 of 3 indexers failed. A: Timed out");
  });

  // The scoped single-indexer search shows the tracker's message verbatim —
  // the banner title already names the indexer.
  it("passes a sole slice's error through bare", () => {
    const out = combineIndexerSearches([failed("FileList", "cookie expired")]);
    expect(out.error?.message).toBe("cookie expired");
  });

  // A partial failure with something to show stays silent, same rule as the
  // old aggregate handling (#314).
  it("stays silent on failures when other indexers returned releases", () => {
    const out = combineIndexerSearches([
      done("A", [release("a1", 1)]),
      failed("B", "boom"),
    ]);
    expect(out).toMatchObject({ isLoading: false, isError: false });
    expect(out.data).toHaveLength(1);
  });

  it("settles to an empty result on a genuine all-indexer no-match", () => {
    const out = combineIndexerSearches([done("A", []), done("B", [])]);
    expect(out).toEqual({ data: [], isLoading: false, isError: false, error: null });
  });

  it("settles to an empty result with no indexers configured", () => {
    expect(combineIndexerSearches([])).toEqual({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
  });
});
