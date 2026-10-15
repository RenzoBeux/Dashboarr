import { bulkConfirmMessage } from "@/lib/tdarr-selection";

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
