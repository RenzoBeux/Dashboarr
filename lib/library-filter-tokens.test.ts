import {
  choiceToken,
  tagToken,
  filterTokens,
  filterSortA11yLabel,
  countHiddenMatches,
} from "./library-filter-tokens";

const MONITOR = [
  { value: "monitored", label: "Monitored" },
  { value: "missing", label: "Missing" },
  { value: "all", label: "All" },
] as const;
const SORT = [
  { key: "added-desc", label: "Recently Added" },
  { key: "title-asc", label: "Title: A → Z" },
] as const;

describe("choiceToken", () => {
  it("is null at the default", () => {
    expect(
      choiceToken({
        key: "m",
        value: "monitored",
        defaultValue: "monitored",
        options: MONITOR,
        reset: jest.fn(),
      }),
    ).toBeNull();
  });

  it("names a filter by its option label, from value-keyed options", () => {
    const reset = jest.fn();
    const t = choiceToken({
      key: "m",
      value: "missing",
      defaultValue: "monitored",
      options: MONITOR,
      reset,
    });
    expect(t).toMatchObject({
      key: "m",
      label: "Missing",
      a11yLabel: "Remove filter: Missing",
    });
    t!.onRemove();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reads a sort as 'Sorted by' and resets it, from key-keyed options", () => {
    const t = choiceToken({
      key: "s",
      value: "title-asc",
      defaultValue: "added-desc",
      options: SORT,
      kind: "sort",
      reset: jest.fn(),
    });
    expect(t).toMatchObject({
      label: "Sorted by Title: A → Z",
      a11yLabel: "Reset sort: Title: A → Z",
    });
  });

  it("falls back to the raw value for an unknown option", () => {
    const t = choiceToken({
      key: "m",
      value: "gone" as string,
      defaultValue: "monitored",
      options: MONITOR,
      reset: jest.fn(),
    });
    expect(t?.label).toBe("gone");
  });
});

describe("tagToken", () => {
  it("is null without a selection or without a way to clear it", () => {
    expect(tagToken(null, jest.fn())).toBeNull();
    expect(tagToken("4K", undefined)).toBeNull();
  });

  it("shows the summary and clears on remove", () => {
    const clear = jest.fn();
    const t = tagToken("2 tags", clear)!;
    expect(t).toMatchObject({
      key: "tags",
      label: "2 tags",
      a11yLabel: "Remove tag filter: 2 tags",
    });
    t.onRemove();
    expect(clear).toHaveBeenCalled();
  });
});

describe("filterTokens", () => {
  it("drops nulls and keeps order", () => {
    const a = tagToken("4K", jest.fn());
    const b = choiceToken({
      key: "m",
      value: "all",
      defaultValue: "monitored",
      options: MONITOR,
      reset: jest.fn(),
    });
    expect(filterTokens([null, b, null, a]).map((t) => t.key)).toEqual([
      "m",
      "tags",
    ]);
  });
});

describe("filterSortA11yLabel", () => {
  it("says how many choices are set", () => {
    expect(filterSortA11yLabel(0)).toBe("Filter and sort");
    expect(filterSortA11yLabel(2)).toBe("Filter and sort, 2 active");
  });
});

describe("countHiddenMatches", () => {
  const items = [
    { t: "Sicario", monitored: false },
    { t: "Sicario 2", monitored: true },
    { t: "Arrival", monitored: false },
  ];
  const search = (i: { t: string }) => i.t.startsWith("Sic");
  const scope = (i: { monitored: boolean }) => i.monitored;

  it("counts search matches the scope keeps out", () => {
    expect(countHiddenMatches(items, search, scope)).toBe(1);
  });

  it("is 0 without a search or without items", () => {
    expect(countHiddenMatches(items, undefined, scope)).toBe(0);
    expect(
      countHiddenMatches<(typeof items)[number]>(undefined, search, scope),
    ).toBe(0);
  });
});
