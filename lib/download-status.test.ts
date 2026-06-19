import { downloadStatusColor } from "@/lib/download-status";
import { DOWNLOAD_INDICATOR_COLOR } from "@/lib/arr-poster-status";

describe("downloadStatusColor", () => {
  it("downloading reads the app's purple cue (issue #208)", () => {
    expect(downloadStatusColor("downloading")).toBe(
      DOWNLOAD_INDICATOR_COLOR.downloading,
    );
  });

  it("seeding / completed → green", () => {
    expect(downloadStatusColor("seeding")).toBe("#22c55e");
    expect(downloadStatusColor("completed")).toBe("#22c55e");
  });

  it("paused → amber", () => {
    expect(downloadStatusColor("paused")).toBe("#f59e0b");
  });

  it("errored / failed → red", () => {
    expect(downloadStatusColor("errored")).toBe("#ef4444");
    expect(downloadStatusColor("failed")).toBe("#ef4444");
  });

  it("queued / other / unknown → neutral blue", () => {
    expect(downloadStatusColor("queued")).toBe("#3b82f6");
    expect(downloadStatusColor("other")).toBe("#3b82f6");
    expect(downloadStatusColor("whatever")).toBe("#3b82f6");
  });
});
