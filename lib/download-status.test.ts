import { downloadBadgeColor, downloadStatusColor } from "@/lib/download-status";
import { DOWNLOAD_INDICATOR_COLOR } from "@/lib/arr-poster-status";
import { torrentBadgeVariant } from "@/lib/torrent-adapter";
import { usenetBadgeVariant } from "@/lib/usenet-adapter";

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

describe("downloadBadgeColor", () => {
  it("downloading is purple, not the app's blue accent (issue #249)", () => {
    expect(downloadBadgeColor("downloading")).toBe(
      DOWNLOAD_INDICATOR_COLOR.downloading,
    );
  });

  it("maps the remaining badge variants to their status colors", () => {
    expect(downloadBadgeColor("seeding")).toBe("#22c55e");
    expect(downloadBadgeColor("paused")).toBe("#f59e0b");
    // "error" is the badge spelling of the "errored" status.
    expect(downloadBadgeColor("error")).toBe("#ef4444");
    expect(downloadBadgeColor("default")).toBe("#3b82f6");
  });

  it("covers every variant the torrent/usenet adapters can produce", () => {
    const torrentStatuses = [
      "downloading",
      "seeding",
      "paused",
      "stalled",
      "checking",
      "queued",
      "errored",
      "other",
    ] as const;
    const usenetStatuses = [
      "downloading",
      "paused",
      "queued",
      "completed",
      "failed",
      "other",
    ] as const;

    for (const status of torrentStatuses) {
      expect(downloadBadgeColor(torrentBadgeVariant(status))).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const status of usenetStatuses) {
      expect(downloadBadgeColor(usenetBadgeVariant(status))).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("a downloading row's bar and badge agree", () => {
    expect(downloadBadgeColor(torrentBadgeVariant("downloading"))).toBe(
      downloadBadgeColor(usenetBadgeVariant("downloading")),
    );
  });
});
