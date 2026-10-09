import {
  TDARR_TABLES, getTableDef, tableCount, rowActions, rowSizeLine, rowTimestamp, nextStatusTableStart, flattenStatusPages,
  applyRowAction,
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

  it("drops a timestamp a Date can't represent instead of crashing the list", () => {
    const r = row({ lastTranscodeDate: 9e15 });
    expect(rowTimestamp(r, "table2")).toBeUndefined();
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

describe("flattenStatusPages", () => {
  const pg = (ids: string[]) => ({
    array: ids.map((id) => row({ _id: id, file: id })),
    totalCount: 99,
  });
  it("keeps the first occurrence of an id repeated across a page boundary", () => {
    const out = flattenStatusPages([pg(["a", "b"]), pg(["b", "c"])]);
    expect(out.map((r) => r._id)).toEqual(["a", "b", "c"]);
  });
  it("tolerates empty, undefined and array-less pages", () => {
    expect(flattenStatusPages([])).toEqual([]);
    expect(flattenStatusPages(undefined)).toEqual([]);
    const odd = [pg(["a"]), { totalCount: 0 }, pg([])] as never;
    expect(flattenStatusPages(odd).map((r) => r._id)).toEqual(["a"]);
  });
});

describe("applyRowAction", () => {
  const ids = (d: { pages: { array: TdarrStatusTableRow[] }[] } | undefined) =>
    d?.pages.flatMap((p) => p.array.map((r) => r._id));
  const data = () => ({ pages: [page(3, 5), { ...page(2, 5), array: [
    { _id: "3" } as TdarrStatusTableRow, { _id: "4" } as TdarrStatusTableRow,
  ] }], pageParams: [0, 3] });
  const [bump, skip] = rowActions("table1");

  it("removes moved rows and shrinks the total so paging stays in step", () => {
    const out = applyRowAction(data(), ["1", "4"], skip);
    expect(ids(out)).toEqual(["0", "2", "3"]);
    expect(out?.pages.map((p) => p.totalCount)).toEqual([3, 3]);
    expect(out?.pageParams).toEqual([0, 3]);
  });

  it("keeps bumped rows in place and flags them", () => {
    const out = applyRowAction(data(), ["2"], bump);
    expect(ids(out)).toEqual(["0", "1", "2", "3", "4"]);
    expect(out?.pages[0].array[2].bumped).toBe(true);
    expect(out?.pages[0].totalCount).toBe(5);
  });

  it("leaves an uncached table alone", () => {
    expect(applyRowAction(undefined, ["1"], skip)).toBeUndefined();
  });
});

