import {
  queueImportBlocked,
  queueIssueSeverity,
  queueIssueMessages,
  queueStatusLabel,
  worstQueueSeverity,
  type ArrQueueIssueRecord,
} from "@/lib/arr-queue-issues";

function record(over: Partial<ArrQueueIssueRecord> = {}): ArrQueueIssueRecord {
  return { status: "downloading", trackedDownloadStatus: "ok", ...over };
}

describe("queueIssueSeverity", () => {
  it("returns null for a healthy record", () => {
    expect(queueIssueSeverity(record())).toBeNull();
  });

  it("returns null when the tracked status is missing", () => {
    expect(queueIssueSeverity({})).toBeNull();
    expect(queueIssueSeverity({ status: "downloading" })).toBeNull();
  });

  it("maps tracked status to severity", () => {
    expect(queueIssueSeverity(record({ trackedDownloadStatus: "warning" }))).toBe(
      "warning",
    );
    expect(queueIssueSeverity(record({ trackedDownloadStatus: "error" }))).toBe(
      "error",
    );
  });

  it("is case-insensitive", () => {
    expect(queueIssueSeverity(record({ trackedDownloadStatus: "Warning" }))).toBe(
      "warning",
    );
    expect(queueIssueSeverity(record({ trackedDownloadStatus: "ERROR" }))).toBe(
      "error",
    );
  });

  it("falls back to the queue status for pending releases", () => {
    expect(
      queueIssueSeverity({ status: "warning", trackedDownloadStatus: undefined }),
    ).toBe("warning");
    expect(
      queueIssueSeverity({ status: "failed", trackedDownloadStatus: undefined }),
    ).toBe("error");
  });

  it("lets error outrank warning", () => {
    expect(
      queueIssueSeverity({ status: "warning", trackedDownloadStatus: "error" }),
    ).toBe("error");
    expect(
      queueIssueSeverity({ status: "failed", trackedDownloadStatus: "warning" }),
    ).toBe("error");
  });
});

describe("worstQueueSeverity", () => {
  it("returns null for an empty list or a clean list", () => {
    expect(worstQueueSeverity([])).toBeNull();
    expect(worstQueueSeverity([{ severity: null }, { severity: undefined }])).toBeNull();
  });

  it("prefers error over warning regardless of order", () => {
    expect(
      worstQueueSeverity([{ severity: "warning" }, { severity: "error" }]),
    ).toBe("error");
    expect(
      worstQueueSeverity([{ severity: "error" }, { severity: "warning" }]),
    ).toBe("error");
  });

  it("returns warning when that is the worst", () => {
    expect(worstQueueSeverity([{ severity: null }, { severity: "warning" }])).toBe(
      "warning",
    );
  });
});

describe("queueStatusLabel", () => {
  it("labels a healthy download", () => {
    expect(queueStatusLabel(record({ trackedDownloadState: "downloading" }))).toBe(
      "Downloading",
    );
  });

  it("labels importBlocked regardless of severity", () => {
    expect(
      queueStatusLabel(record({ trackedDownloadState: "importBlocked" })),
    ).toBe("Import blocked");
  });

  it("distinguishes a pending import from a blocked one", () => {
    expect(
      queueStatusLabel(record({ trackedDownloadState: "importPending" })),
    ).toBe("Waiting to import");
    expect(
      queueStatusLabel(
        record({
          trackedDownloadState: "importPending",
          trackedDownloadStatus: "warning",
        }),
      ),
    ).toBe("Import blocked");
  });

  it("labels the failure states", () => {
    expect(queueStatusLabel(record({ trackedDownloadState: "failed" }))).toBe(
      "Download failed",
    );
    expect(
      queueStatusLabel(record({ trackedDownloadState: "failedPending" })),
    ).toBe("Download failed");
    expect(queueStatusLabel(record({ trackedDownloadState: "ignored" }))).toBe(
      "Ignored",
    );
  });

  // A state upstream doesn't have (or a future one) must not fall through to a
  // healthy-looking label when the record is flagged.
  it("falls back to severity when the state is unknown or absent", () => {
    expect(
      queueStatusLabel(
        record({
          trackedDownloadState: "someFutureState",
          trackedDownloadStatus: "error",
        }),
      ),
    ).toBe("Download failed");
    expect(queueStatusLabel({ trackedDownloadStatus: "warning" })).toBe(
      "Download warning",
    );
    expect(queueStatusLabel({ trackedDownloadStatus: "error" })).toBe(
      "Download failed",
    );
    expect(queueStatusLabel({})).toBe("Downloading");
  });
});

describe("queueImportBlocked", () => {
  it("matches importBlocked regardless of severity", () => {
    expect(
      queueImportBlocked(record({ trackedDownloadState: "importBlocked" })),
    ).toBe(true);
    expect(
      queueImportBlocked(
        record({
          trackedDownloadState: "importBlocked",
          trackedDownloadStatus: "warning",
        }),
      ),
    ).toBe(true);
  });

  it("matches importPending only when it carries an issue", () => {
    expect(
      queueImportBlocked(record({ trackedDownloadState: "importPending" })),
    ).toBe(false);
    expect(
      queueImportBlocked(
        record({
          trackedDownloadState: "importPending",
          trackedDownloadStatus: "warning",
        }),
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      queueImportBlocked(record({ trackedDownloadState: "ImportBlocked" })),
    ).toBe(true);
  });

  // A failed or in-flight download has nothing on disk to import, however
  // loudly the record is flagged.
  it("rejects the non-import stuck states", () => {
    expect(
      queueImportBlocked(
        record({
          trackedDownloadState: "failed",
          trackedDownloadStatus: "error",
        }),
      ),
    ).toBe(false);
    expect(
      queueImportBlocked(
        record({
          trackedDownloadState: "downloading",
          trackedDownloadStatus: "warning",
        }),
      ),
    ).toBe(false);
    expect(queueImportBlocked(record())).toBe(false);
    expect(queueImportBlocked({})).toBe(false);
  });
});

describe("queueIssueMessages", () => {
  it("returns nothing when there is nothing to report", () => {
    expect(queueIssueMessages({})).toEqual([]);
    expect(queueIssueMessages({ statusMessages: [] })).toEqual([]);
  });

  it("puts errorMessage first", () => {
    expect(
      queueIssueMessages({
        errorMessage: "Download client reported an error",
        statusMessages: [{ title: "Release", messages: ["Sample file"] }],
      }),
    ).toEqual(["Download client reported an error", "Sample file"]);
  });

  it("flattens messages from every status message entry", () => {
    expect(
      queueIssueMessages({
        statusMessages: [
          { title: "Release.A", messages: ["No files eligible for import", "Sample"] },
          { title: "Release.B", messages: ["Unknown movie"] },
        ],
      }),
    ).toEqual(["No files eligible for import", "Sample", "Unknown movie"]);
  });

  it("uses the title when an entry carries no messages", () => {
    expect(
      queueIssueMessages({
        statusMessages: [
          { title: "One or more episodes expected in this release were not imported" },
          { title: "Ignored", messages: [] },
        ],
      }),
    ).toEqual([
      "One or more episodes expected in this release were not imported",
      "Ignored",
    ]);
  });

  it("dedupes and trims", () => {
    expect(
      queueIssueMessages({
        errorMessage: " Sample file ",
        statusMessages: [
          { title: "A", messages: ["Sample file"] },
          { title: "B", messages: ["Sample file", "   "] },
        ],
      }),
    ).toEqual(["Sample file"]);
  });
});
