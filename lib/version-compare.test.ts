import { compareVersions, versionAtLeast } from "./version-compare";

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.6.1", "1.6.2")).toBeLessThan(0);
    expect(compareVersions("1.6", "1.6.0")).toBe(0);
  });

  it("ignores a leading v", () => {
    expect(compareVersions("v1.6.2", "1.6.2")).toBe(0);
    expect(compareVersions("V1.6.2", "v1.6.1")).toBeGreaterThan(0);
  });

  it("drops pre-release and build suffixes", () => {
    expect(compareVersions("1.6.3-beta.8", "1.6.3")).toBe(0);
    expect(compareVersions("1.6.3-beta.8", "1.6.2")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0+abc", "1.2.0")).toBe(0);
  });
});

describe("versionAtLeast", () => {
  it("gates on the minimum version", () => {
    expect(versionAtLeast("1.6.1", "1.6.1")).toBe(true);
    expect(versionAtLeast("v1.6.2", "1.6.1")).toBe(true);
    expect(versionAtLeast("1.5.6", "1.6.1")).toBe(false);
  });

  it("treats an unknown version as too old", () => {
    expect(versionAtLeast(null, "1.0.0")).toBe(false);
    expect(versionAtLeast(undefined, "1.0.0")).toBe(false);
    expect(versionAtLeast("", "1.0.0")).toBe(false);
  });
});
