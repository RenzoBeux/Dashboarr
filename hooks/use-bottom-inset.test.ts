import { resolveBottomInset } from "./use-bottom-inset";

describe("resolveBottomInset", () => {
  it("uses the live inset on Android when it is non-zero", () => {
    expect(resolveBottomInset(48, 48, "android")).toBe(48);
    expect(resolveBottomInset(24, 48, "android")).toBe(24);
  });

  it("falls back to initial metrics on Android when the live inset is 0 (One UI 7 3-button bug)", () => {
    expect(resolveBottomInset(0, 48, "android")).toBe(48);
  });

  it("stays 0 on Android when both live and initial insets are 0", () => {
    expect(resolveBottomInset(0, 0, "android")).toBe(0);
  });

  it("never falls back on iOS", () => {
    expect(resolveBottomInset(0, 34, "ios")).toBe(0);
    expect(resolveBottomInset(34, 0, "ios")).toBe(34);
  });
});
