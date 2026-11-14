import type { OverseerrRequest, OverseerrRequestsResponse } from "@/lib/types";
import { flattenSeerrRequestPages, nextSeerrRequestsPage } from "@/lib/seerr-request-pages";

function page(ids: number[], total: number, pageNumber = 1): OverseerrRequestsResponse {
  return {
    pageInfo: { pages: Math.ceil(total / 20), pageSize: 20, results: total, page: pageNumber },
    results: ids.map((id) => ({ id }) as OverseerrRequest),
  };
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

describe("nextSeerrRequestsPage", () => {
  it("asks for page 2 when 30 requests exist and 20 are loaded", () => {
    const first = page(range(1, 20), 30);
    expect(nextSeerrRequestsPage(first, [first])).toBe(2);
  });

  it("stops once every request is loaded", () => {
    const first = page(range(1, 20), 30);
    const second = page(range(21, 10), 30, 2);
    expect(nextSeerrRequestsPage(second, [first, second])).toBeUndefined();
  });

  it("stops on a single short page", () => {
    const only = page(range(1, 3), 3);
    expect(nextSeerrRequestsPage(only, [only])).toBeUndefined();
  });

  it("stops on an empty page even if the total says there is more", () => {
    const first = page(range(1, 20), 45);
    const empty = page([], 45, 2);
    expect(nextSeerrRequestsPage(empty, [first, empty])).toBeUndefined();
  });
});

describe("flattenSeerrRequestPages", () => {
  it("returns an empty list before the first page lands", () => {
    expect(flattenSeerrRequestPages(undefined)).toEqual([]);
  });

  it("keeps page order and drops a row repeated across pages", () => {
    const first = page([5, 4, 3], 6);
    const second = page([3, 2, 1], 6, 2);
    expect(flattenSeerrRequestPages([first, second]).map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });
});
