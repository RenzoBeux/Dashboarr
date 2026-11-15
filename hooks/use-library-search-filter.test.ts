import {
  combineFilters,
  librarySearchIndex,
  librarySearchPredicate,
} from "./use-library-search-filter";

describe("librarySearchPredicate", () => {
  const items = [
    { id: 1, title: "Dune", year: 2021 },
    { id: 2, title: "Dune", year: 1984 },
    { id: 3, title: "Foundation", year: 0 },
    { id: 4, title: "Andor", year: 2022 },
  ];
  const index = librarySearchIndex(items);

  it("is undefined for an empty or blank query", () => {
    expect(librarySearchPredicate(index, "")).toBeUndefined();
    expect(librarySearchPredicate(index, "   ")).toBeUndefined();
  });

  it("matches every title containing the query", () => {
    const match = librarySearchPredicate(index, "dune")!;
    expect(items.filter(match).map((i) => i.id)).toEqual([1, 2]);
  });

  it("narrows by a trailing year", () => {
    const match = librarySearchPredicate(index, "dune 1984")!;
    expect(items.filter(match).map((i) => i.id)).toEqual([2]);
  });

  it("doesn't let a trailing year hide a title with no year yet (year 0)", () => {
    const match = librarySearchPredicate(index, "foundation 2026")!;
    expect(items.filter(match).map((i) => i.id)).toEqual([3]);
  });
});

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
