import { toggleSelected, pruneSelection, bulkConfirmMessage } from "@/lib/tdarr-selection";

describe("toggleSelected", () => {
  it("adds and removes without mutating the input", () => {
    const a = new Set(["x"]);
    const b = toggleSelected(a, "y");
    expect([...b].sort()).toEqual(["x", "y"]);
    expect([...a]).toEqual(["x"]);
    expect([...toggleSelected(b, "x")]).toEqual(["y"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that left the list after a refetch", () => {
    expect([...pruneSelection(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
  });
});

describe("bulkConfirmMessage", () => {
  const requeue = { key: "requeue" as const, label: "Requeue", updatedObj: {} };
  it("states the exact count and the table", () => {
    expect(bulkConfirmMessage(requeue, 989, "Transcode: Success/Not required"))
      .toBe('Requeue all 989 files in "Transcode: Success/Not required"?');
  });
  it("singularises and survives an unknown count", () => {
    expect(bulkConfirmMessage(requeue, 1, "Hold")).toBe('Requeue all 1 file in "Hold"?');
    expect(bulkConfirmMessage(requeue, null, "Hold")).toBe('Requeue every file in "Hold"?');
  });
});
