import {
  SETTLE_MAX_MS,
  departedIds,
} from "./use-refresh-on-download-complete";

describe("departedIds", () => {
  it("reports ids that left the queue", () => {
    expect(departedIds(new Set([1, 2, 3]), new Set([1, 3]))).toEqual([2]);
  });

  it("ignores ids that joined the queue", () => {
    expect(departedIds(new Set([1]), new Set([1, 2]))).toEqual([]);
  });

  it("is empty when nothing moved", () => {
    expect(departedIds(new Set([1, 2]), new Set([1, 2]))).toEqual([]);
  });

  // A queue query that errors into no data empties the set, which reads as
  // "everything completed". One redundant calendar refresh is the correct,
  // self-correcting outcome — the hold is released by the same refresh.
  it("treats an emptied queue as every id departing", () => {
    expect(departedIds(new Set(["a:1", "a:2"]), new Set())).toEqual([
      "a:1",
      "a:2",
    ]);
  });

  it("handles the first render, when nothing was seen yet", () => {
    expect(departedIds(new Set(), new Set([1]))).toEqual([]);
  });
});

describe("SETTLE_MAX_MS", () => {
  // The hold must outlive a normal calendar round trip but expire well before
  // lib/query-client.ts's retry ladder (2 retries, exponential backoff, 15s
  // request timeout) would resolve against an unreachable server — otherwise a
  // dead Sonarr leaves rows stuck on "downloading".
  it("is bounded well below the retry ladder's worst case", () => {
    expect(SETTLE_MAX_MS).toBeGreaterThanOrEqual(1_000);
    expect(SETTLE_MAX_MS).toBeLessThan(15_000);
  });
});
