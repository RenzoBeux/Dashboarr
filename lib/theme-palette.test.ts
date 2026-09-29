import { paletteVars, themeColor, themedShades } from "./theme-palette";

describe("themeColor", () => {
  it("returns every color unchanged under the dark scheme", () => {
    expect(themeColor("#a1a1aa", "dark")).toBe("#a1a1aa");
    expect(themeColor("#f87171", "dark")).toBe("#f87171");
  });

  it("fully inverts zinc under the light scheme", () => {
    expect(themeColor("#f4f4f5", "light")).toBe("#18181b"); // 100 -> 900
    expect(themeColor("#a1a1aa", "light")).toBe("#52525b"); // 400 -> 600
    expect(themeColor("#27272a", "light")).toBe("#e4e4e7"); // 800 -> 200
    expect(themeColor("#71717a", "light")).toBe("#71717a"); // 500 stays
  });

  it("mirrors only the pale and darkest accent shades", () => {
    expect(themeColor("#f87171", "light")).toBe("#dc2626"); // red-400 -> 600
    expect(themeColor("#ef4444", "light")).toBe("#ef4444"); // red-500 stays
    expect(themeColor("#16a34a", "light")).toBe("#16a34a"); // green-600 stays
    expect(themeColor("#450a0a", "light")).toBe("#fef2f2"); // red-950 -> 50
  });

  it("is case-insensitive and passes through non-palette colors", () => {
    expect(themeColor("#A1A1AA", "light")).toBe("#52525b");
    expect(themeColor("#fff", "light")).toBe("#fff");
    expect(themeColor("rgba(0,0,0,0.5)", "light")).toBe("rgba(0,0,0,0.5)");
    expect(themeColor(undefined, "light")).toBeUndefined();
  });
});

describe("paletteVars", () => {
  it("emits one channel triplet per themed shade", () => {
    const dark = paletteVars("dark");
    expect(dark["--zinc-100"]).toBe("244 244 245");
    expect(dark["--zinc-500"]).toBeUndefined();
    expect(Object.keys(dark)).toEqual(Object.keys(paletteVars("light")));
    expect(Object.keys(dark)).toHaveLength(
      themedShades("zinc").length + 17 * themedShades("red").length,
    );
  });

  it("maps the light scheme to the mirrored shade", () => {
    expect(paletteVars("light")["--zinc-100"]).toBe("24 24 27");
    expect(paletteVars("light")["--amber-400"]).toBe("217 119 6");
  });
});
