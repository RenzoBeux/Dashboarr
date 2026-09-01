import { fmt, fileBaseName, sumParts } from "@/lib/tdarr-format";

// Tdarr's response shapes were mapped from a live instance rather than from
// its (field-less) OpenAPI stubs, so every helper here has to survive a field
// simply not being there on another build. These cases pin that down.

describe("fmt", () => {
  it("formats numbers and Tdarr's numeric strings alike", () => {
    expect(fmt(12.345, 1)).toBe("12.3");
    expect(fmt("98.6", 1)).toBe("98.6");
    expect(fmt(42, 0)).toBe("42");
  });

  it("falls back to a dash instead of rendering NaN or undefined", () => {
    expect(fmt(undefined)).toBe("—");
    expect(fmt(null)).toBe("—");
    expect(fmt("not a number")).toBe("—");
    expect(fmt(Infinity)).toBe("—");
  });
});

describe("fileBaseName", () => {
  it("takes the basename on POSIX and Windows nodes", () => {
    expect(fileBaseName("/media/movies/Arrival.mkv")).toBe("Arrival.mkv");
    expect(fileBaseName("C:\\media\\movies\\Arrival.mkv")).toBe("Arrival.mkv");
  });

  it("returns undefined for missing or trailing-separator paths so callers can fall back", () => {
    expect(fileBaseName(undefined)).toBeUndefined();
    expect(fileBaseName("")).toBeUndefined();
    expect(fileBaseName("/media/movies/")).toBeUndefined();
  });
});

describe("sumParts", () => {
  it("sums the CPU and GPU halves of a queue length", () => {
    expect(sumParts(2, 3)).toBe("5");
    expect(sumParts("2", 3)).toBe("5");
  });

  it("treats an absent half as zero rather than rendering NaN", () => {
    expect(sumParts(2, undefined)).toBe("2");
    expect(sumParts(undefined, 3)).toBe("3");
  });

  it("falls back to a dash only when nothing was reported", () => {
    expect(sumParts(undefined, undefined)).toBe("—");
    expect(sumParts()).toBe("—");
  });
});
