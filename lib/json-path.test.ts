import { formatStat, getPath } from "@/lib/json-path";

describe("getPath", () => {
  const obj = {
    data: { status: "ok", nested: { deep: 42 } },
    items: [
      { name: "alpha", tags: ["a", "b"] },
      { name: "beta", tags: ["c"] },
    ],
    count: 3,
    flag: true,
    empty: null,
  };

  it("resolves a dotted key path", () => {
    expect(getPath(obj, "data.status")).toBe("ok");
    expect(getPath(obj, "data.nested.deep")).toBe(42);
  });

  it("resolves a top-level key", () => {
    expect(getPath(obj, "count")).toBe(3);
    expect(getPath(obj, "flag")).toBe(true);
  });

  it("returns the whole object for an empty path", () => {
    expect(getPath(obj, "")).toBe(obj);
    expect(getPath(obj, "   ")).toBe(obj);
  });

  it("supports dotted numeric indexes", () => {
    expect(getPath(obj, "items.0.name")).toBe("alpha");
    expect(getPath(obj, "items.1.name")).toBe("beta");
  });

  it("supports bracket numeric indexes", () => {
    expect(getPath(obj, "items[0].name")).toBe("alpha");
    expect(getPath(obj, "items[1].tags[0]")).toBe("c");
  });

  it("supports negative bracket indexes from the end", () => {
    expect(getPath(obj, "items[-1].name")).toBe("beta");
  });

  it("returns array length via # as the last segment", () => {
    expect(getPath(obj, "items.#")).toBe(2);
    expect(getPath(obj, "items[0].tags.#")).toBe(2);
  });

  it("returns array length via 'length' as the last segment", () => {
    expect(getPath(obj, "items.length")).toBe(2);
  });

  it("returns string length via # or length", () => {
    expect(getPath(obj, "data.status.#")).toBe(2);
    expect(getPath(obj, "data.status.length")).toBe(2);
  });

  it("maps over an array with #.<path>", () => {
    expect(getPath(obj, "items.#.name")).toEqual(["alpha", "beta"]);
  });

  it("maps over an array with [*].<path>", () => {
    expect(getPath(obj, "items[*].name")).toEqual(["alpha", "beta"]);
  });

  it("returns the array itself for a trailing [*] or #", () => {
    expect(getPath(obj, "items[*]")).toEqual(obj.items);
  });

  it("maps nested paths per element", () => {
    expect(getPath(obj, "items.#.tags.#")).toEqual([2, 1]);
  });

  it("returns undefined for a missing key", () => {
    expect(getPath(obj, "data.missing")).toBeUndefined();
    expect(getPath(obj, "nope.at.all")).toBeUndefined();
  });

  it("returns undefined when indexing past the end or into a non-array", () => {
    expect(getPath(obj, "items.9.name")).toBeUndefined();
    expect(getPath(obj, "count.0")).toBeUndefined();
  });

  it("returns undefined when # or length is used on a non-array/string", () => {
    expect(getPath(obj, "count.#")).toBeUndefined();
    expect(getPath(obj, "flag.length")).toBeUndefined();
  });

  it("returns undefined when mapping a non-array", () => {
    expect(getPath(obj, "data[*].x")).toBeUndefined();
  });

  it("returns undefined past a null value", () => {
    expect(getPath(obj, "empty.anything")).toBeUndefined();
  });

  it("treats a non-terminal 'length' as a literal object key", () => {
    expect(getPath({ length: { value: 5 } }, "length.value")).toBe(5);
  });
});

describe("formatStat", () => {
  it("formats text (default when no format given)", () => {
    expect(formatStat("hello")).toBe("hello");
    expect(formatStat(42)).toBe("42");
    expect(formatStat(true, "text")).toBe("true");
  });

  it("returns an empty string for null/undefined regardless of format", () => {
    expect(formatStat(undefined, "number")).toBe("");
    expect(formatStat(null, "bytes")).toBe("");
  });

  it("formats numbers with thousands separators", () => {
    expect(formatStat(1234567, "number")).toBe("1,234,567");
    expect(formatStat(42, "number")).toBe("42");
    expect(formatStat("99", "number")).toBe("99");
    expect(formatStat(-1234, "number")).toBe("-1,234");
  });

  it("formats bytes as IEC units with one decimal", () => {
    expect(formatStat(0, "bytes")).toBe("0 B");
    expect(formatStat(1024, "bytes")).toBe("1.0 KiB");
    expect(formatStat(1536, "bytes")).toBe("1.5 KiB");
    expect(formatStat(1024 * 1024 * 3, "bytes")).toBe("3.0 MiB");
  });

  it("formats duration seconds as a compact d/h/m breakdown", () => {
    expect(formatStat(45, "duration")).toBe("45s");
    expect(formatStat(45 * 60, "duration")).toBe("45m");
    expect(formatStat(2 * 3600 + 15 * 60, "duration")).toBe("2h 15m");
    expect(formatStat(86400 + 2 * 3600 + 3 * 60 + 20, "duration")).toBe("1d 2h 3m");
  });

  it("formats percent values", () => {
    expect(formatStat(42, "percent")).toBe("42%");
    expect(formatStat(42.5, "percent")).toBe("42.5%");
    expect(formatStat(42.449, "percent")).toBe("42.4%");
  });

  it("never throws on a non-numeric value for number/bytes/duration/percent, falling back to the raw string", () => {
    // e.g. Cleanuparr's upTime is a .NET TimeSpan string, not a second count.
    expect(formatStat("0.12:34:56.789", "duration")).toBe("0.12:34:56.789");
    expect(formatStat("n/a", "number")).toBe("n/a");
    expect(formatStat("unknown", "bytes")).toBe("unknown");
    expect(formatStat("n/a", "percent")).toBe("n/a");
    expect(formatStat({ weird: true }, "number")).toBe('{"weird":true}');
  });
});
