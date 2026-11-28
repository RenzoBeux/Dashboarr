import {
  buildPath,
  chartYMax,
  formatChartValue,
  parseBeszelDate,
  hasAnyValue,
  topKeysByAverage,
} from "@/lib/beszel-chart-math";

describe("chartYMax", () => {
  it("uses the fixed max for percentage charts", () => {
    expect(chartYMax([[10, 50]], 100)).toBe(100);
  });

  it("adds 10% headroom over the data max", () => {
    expect(chartYMax([[10, 50]])).toBeCloseTo(55);
  });

  it("never returns 0, so an all-zero series still has a scale", () => {
    expect(chartYMax([[0, 0]])).toBe(1);
  });

  it("ignores gaps", () => {
    expect(chartYMax([[undefined, 20], [undefined]])).toBeCloseTo(22);
  });
});

describe("buildPath", () => {
  it("breaks the line at gaps", () => {
    expect(buildPath([1, undefined, 3], 100, 50, 0, 10)).toHaveLength(2);
  });

  it("draws a single point as a short flat segment, not NaN", () => {
    const runs = buildPath([5], 100, 50, 0, 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).not.toContain("NaN");
    expect(runs[0].split(" ")).toHaveLength(2);
  });

  it("maps the max to the top pad and 0 to the bottom", () => {
    const [run] = buildPath([0, 10], 100, 50, 5, 10);
    expect(run).toBe("0,50 100,5");
  });
});

describe("hasAnyValue", () => {
  it("is false when every series is empty or gaps", () => {
    expect(hasAnyValue([[undefined], []])).toBe(false);
  });

  it("is true for a real zero", () => {
    expect(hasAnyValue([[undefined, 0]])).toBe(true);
  });
});

describe("topKeysByAverage", () => {
  it("keeps the busiest n and counts the rest", () => {
    expect(topKeysByAverage([{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }])).toEqual({
      names: ["g", "f", "e", "d", "c"],
      hiddenCount: 2,
    });
  });

  it("averages only the points a key appears in", () => {
    // "late" started mid-window at 10%; counting its absence as 0 would rank it below "steady".
    expect(topKeysByAverage([{ steady: 6 }, { steady: 6, late: 10 }], 1).names).toEqual(["late"]);
  });

  it("skips undefined readings", () => {
    expect(topKeysByAverage([{ a: undefined, b: 1 }])).toEqual({ names: ["b"], hiddenCount: 0 });
  });
});

describe("formatChartValue", () => {
  it("formats each unit", () => {
    expect(formatChartValue(23.4, "pct")).toBe("23%");
    expect(formatChartValue(55, "celsius")).toBe("55°C");
    expect(formatChartValue(1.234, "load")).toBe("1.23");
    expect(formatChartValue(1024 ** 3, "bytes")).toBe("1.0 GB");
    expect(formatChartValue(1024 ** 2, "bytesPs")).toBe("1.0 MB/s");
  });
});

describe("parseBeszelDate", () => {
  it("parses PocketBase's space-separated UTC datetime", () => {
    expect(parseBeszelDate("2026-11-28 10:00:00.123Z")?.toISOString()).toBe("2026-11-28T10:00:00.123Z");
  });

  it("passes ISO strings through and rejects junk", () => {
    expect(parseBeszelDate("2026-11-28T10:00:00.000Z")?.getTime()).toBe(Date.UTC(2026, 10, 28, 10));
    expect(parseBeszelDate("nope")).toBeUndefined();
  });
});
