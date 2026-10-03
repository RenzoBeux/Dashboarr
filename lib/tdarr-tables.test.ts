import {
  TDARR_TABLES, getTableDef, tableCount, rowActions, rowSizeLine, rowTimestamp, nextStatusTableStart,
} from "@/lib/tdarr-tables";
import type { TdarrStatistics, TdarrStatusTableRow } from "@/lib/types";

const row = (over: Partial<TdarrStatusTableRow> = {}): TdarrStatusTableRow => ({
  _id: "/m/a.mkv", file: "/m/a.mkv", fileNameWithoutExtension: "a", DB: "lib",
  container: "mkv", file_size: 1024, createdAt: 0, ...over,
});

describe("TDARR_TABLES", () => {
  it("lists all seven tables in web UI order, Hold last", () => {
    expect(TDARR_TABLES.map((t) => t.id)).toEqual(
      ["table1", "table2", "table3", "table4", "table5", "table6", "table0"],
    );
  });
  it("rejects unknown route params", () => {
    expect(getTableDef("table9")).toBeUndefined();
    expect(getTableDef("table3")?.label).toBe("Transcode: Error/Cancelled");
  });
});

describe("tableCount", () => {
  it("reads the matching tableNCount and is null without stats", () => {
    const stats = { table2Count: 989 } as TdarrStatistics;
    expect(tableCount(stats, "table2")).toBe(989);
    expect(tableCount(undefined, "table2")).toBeNull();
  });
});

describe("rowActions", () => {
  it("copies the web UI's updatedObj per table", () => {
    expect(rowActions("table3")).toEqual([
      { key: "requeue", label: "Requeue", updatedObj: { TranscodeDecisionMaker: "Queued" } },
      { key: "ignore", label: "Ignore", updatedObj: { TranscodeDecisionMaker: "Not required" } },
    ]);
    expect(rowActions("table4").map((a) => a.key)).toEqual(["bump", "skip"]);
    expect(rowActions("table0")[0].updatedObj).toEqual({
      TranscodeDecisionMaker: "Queued", HealthCheck: "Queued",
    });
  });
});

describe("rowSizeLine", () => {
  it("shows old → new with the percent ratio on a finished transcode", () => {
    expect(rowSizeLine(row({ oldSize: 8, newSize: 4, newVsOldRatio: 50 }), "table2"))
      .toBe("8.00 GB → 4.00 GB (50%)");
  });
  it("falls back to file_size (MB) when oldSize is 0, like the web UI", () => {
    expect(rowSizeLine(row({ oldSize: 0, newSize: 0 }), "table2")).toBe("1.00 GB");
  });
  it("shows only the file size on queue tables", () => {
    expect(rowSizeLine(row(), "table1")).toBe("1.00 GB");
  });
});

describe("rowTimestamp", () => {
  it("uses the transcode date on transcode tables and the health date on health ones", () => {
    const r = row({ lastTranscodeDate: 1, lastHealthCheckDate: 2 });
    expect(rowTimestamp(r, "table2")).toBe(1);
    expect(rowTimestamp(r, "table6")).toBe(2);
    expect(rowTimestamp(r, "table1")).toBeUndefined();
  });
});

const page = (n: number, total: number) => ({
  array: Array.from({ length: n }, (_, i) => ({ _id: String(i) }) as TdarrStatusTableRow),
  totalCount: total,
});

describe("nextStatusTableStart", () => {
  it("stops immediately on an empty table", () => {
    const p = page(0, 0);
    expect(nextStatusTableStart(p, [p])).toBeUndefined();
  });
  it("continues from the number of rows loaded so far", () => {
    const p1 = page(25, 60), p2 = page(25, 60);
    expect(nextStatusTableStart(p2, [p1, p2])).toBe(50);
  });
  it("stops on totalCount even when the last page is exactly full", () => {
    const p1 = page(25, 50), p2 = page(25, 50);
    expect(nextStatusTableStart(p2, [p1, p2])).toBeUndefined();
  });
  it("stops on a short or empty page even if totalCount drifted upward", () => {
    const p1 = page(25, 100), p2 = page(0, 100);
    expect(nextStatusTableStart(p2, [p1, p2])).toBeUndefined();
  });
});
