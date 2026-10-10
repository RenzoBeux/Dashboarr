import { combineFilters } from "./use-library-search-filter";

describe("combineFilters", () => {
  const even = (n: number) => n % 2 === 0;
  const big = (n: number) => n > 5;

  it("is undefined with nothing active", () => {
    expect(combineFilters<number>(undefined, undefined)).toBeUndefined();
  });

  it("returns a lone predicate as-is, keeping its identity", () => {
    expect(combineFilters<number>(undefined, even)).toBe(even);
  });

  it("ANDs several predicates", () => {
    const both = combineFilters<number>(even, big)!;
    expect([4, 6, 7, 8].filter(both)).toEqual([6, 8]);
  });
});
