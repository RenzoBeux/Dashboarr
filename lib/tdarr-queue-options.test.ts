import {
  TDARR_QUEUE_SORTS, queueSortOptions, buildQueueTogglePatch, rollbackQueuePatch,
} from "@/lib/tdarr-queue-options";
import type { TdarrGlobalSettings } from "@/lib/types";

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
  it("keeps an unknown server value selectable instead of dropping it", () => {
    expect(queueSortOptions("sortSizeSmallest")).toHaveLength(TDARR_QUEUE_SORTS.length);
    expect(queueSortOptions(undefined)).toHaveLength(TDARR_QUEUE_SORTS.length);
    expect(queueSortOptions("someFutureSort").at(-1))
      .toEqual({ value: "someFutureSort", label: "someFutureSort" });
  });
});

describe("rollbackQueuePatch", () => {
  const base: TdarrGlobalSettings = {
    _id: "globalsettings",
    ignoreSchedules: false,
    alternateLibraries: false,
    prioritiseLibraries: false,
  };

  it("undoes only the failed write, keeping a newer one in flight", () => {
    const failed = buildQueueTogglePatch("ignoreSchedules", true);
    const newer = buildQueueTogglePatch("alternateLibraries", true);
    const current = { ...base, ...failed, ...newer };
    expect(rollbackQueuePatch(current, base, failed)).toEqual({ ...base, ...newer });
  });

  it("leaves a field a later toggle already changed", () => {
    const failed = buildQueueTogglePatch("alternateLibraries", true);
    const newer = buildQueueTogglePatch("prioritiseLibraries", true);
    const current = { ...base, ...failed, ...newer };
    expect(rollbackQueuePatch(current, base, failed)).toEqual(current);
  });

  it("restores the snapshot when nothing else changed", () => {
    const failed = buildQueueTogglePatch("prioritiseLibraries", true);
    expect(rollbackQueuePatch({ ...base, ...failed }, base, failed)).toEqual(base);
  });
});
