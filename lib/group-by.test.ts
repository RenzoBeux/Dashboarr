import { groupBy } from "./group-by";

describe("groupBy", () => {
  const items = [
    { day: "2026-10-09", title: "b" },
    { day: "2026-10-08", title: "z" },
    { day: "2026-10-09", title: "a" },
  ];

  it("keeps first-seen group order by default", () => {
    const groups = groupBy(items, (i) => i.day);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-09", "2026-10-08"]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["b", "a"]);
  });

  it("sorts keys and items when asked", () => {
    const groups = groupBy(items, (i) => i.day, {
      sortKeys: (a, b) => a.localeCompare(b),
      sortItems: (a, b) => a.title.localeCompare(b.title),
    });
    expect(groups.map((g) => g.key)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(groups[1].items.map((i) => i.title)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const copy = [...items];
    groupBy(items, (i) => i.day, {
      sortItems: (a, b) => a.title.localeCompare(b.title),
    });
    expect(items).toEqual(copy);
  });

  it("returns no groups for no items", () => {
    expect(groupBy([], () => "x")).toEqual([]);
  });
});
