import {
  TDARR_QUEUE_SORTS, queueSortLabel, buildQueueTogglePatch,
} from "@/lib/tdarr-queue-options";

describe("buildQueueTogglePatch", () => {
  it("turning on library alternation turns prioritisation off, and vice versa", () => {
    expect(buildQueueTogglePatch("alternateLibraries", true))
      .toEqual({ alternateLibraries: true, prioritiseLibraries: false });
    expect(buildQueueTogglePatch("prioritiseLibraries", true))
      .toEqual({ prioritiseLibraries: true, alternateLibraries: false });
  });
  it("transcode and health-check prioritisation are mutually exclusive", () => {
    expect(buildQueueTogglePatch("prioritiseTranscodes", true))
      .toEqual({ prioritiseTranscodes: true, prioritiseHealthChecks: false });
    expect(buildQueueTogglePatch("prioritiseHealthChecks", true))
      .toEqual({ prioritiseHealthChecks: true, prioritiseTranscodes: false });
  });
  it("turning something off touches only that key", () => {
    expect(buildQueueTogglePatch("alternateLibraries", false)).toEqual({ alternateLibraries: false });
    expect(buildQueueTogglePatch("ignoreSchedules", true)).toEqual({ ignoreSchedules: true });
  });
});

describe("queue sorts", () => {
  it("has the web UI's 25 options with No Sort first", () => {
    expect(TDARR_QUEUE_SORTS).toHaveLength(25);
    expect(TDARR_QUEUE_SORTS[0]).toEqual({ value: "noSort", label: "No Sort" });
  });
  it("labels known values and degrades unknown/missing ones", () => {
    expect(queueSortLabel("sortSizeSmallest")).toBe("Smallest");
    expect(queueSortLabel("someFutureSort")).toBe("someFutureSort");
    expect(queueSortLabel(undefined)).toBe("—");
  });
});
