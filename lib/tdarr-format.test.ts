import { fmt, fileBaseName, sumParts, workerFps, totalFps } from "@/lib/tdarr-format";

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

describe("workerFps", () => {
  it("labels a positive fps, like the web UI's `fps > 0` gate", () => {
    expect(workerFps(62)).toBe("62 fps");
    expect(workerFps("24.5")).toBe("25 fps");
  });
  it("hides zero, missing and garbage fps (health-check workers report none)", () => {
    expect(workerFps(0)).toBeNull();
    expect(workerFps(undefined)).toBeNull();
    expect(workerFps("abc")).toBeNull();
  });
});

describe("totalFps", () => {
  it("sums every worker's fps and skips the non-numeric ones", () => {
    expect(totalFps({ a: { fps: 60 }, b: { fps: 30 }, c: {} })).toBe("90");
  });
  it("is 0 for an idle node or a missing workers map", () => {
    expect(totalFps({})).toBe("0");
    expect(totalFps(undefined)).toBe("0");
  });
});
