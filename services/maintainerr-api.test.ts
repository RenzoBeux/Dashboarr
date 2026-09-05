// Mock the http client entirely — maintainerr-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment. HttpError is
// re-exported too because getHealth branches on `err instanceof HttpError`. The
// real-transport tests (maintainerr-api.transport.test.ts) exercise the actual
// wire format that this suite deliberately mocks past.
jest.mock("@/lib/http-client", () => {
  class HttpError extends Error {
    status: number;
    body?: unknown;
    constructor(status: number, statusText: string, url: string, body?: unknown) {
      super(`HTTP ${status}`);
      this.name = "HttpError";
      this.status = status;
      this.body = body;
    }
  }
  return { serviceRequest: jest.fn(), HttpError };
});

import { serviceRequest, HttpError } from "@/lib/http-client";
import {
  getCollections,
  getHealth,
  getMediaCount,
  getVersion,
  maintainerrActionLabel,
  maintainerrHealthTone,
  parseVersionStatus,
  summarizeCollections,
} from "@/services/maintainerr-api";
import type { MaintainerrCollection, MaintainerrVersion } from "@/lib/types";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

describe("request routing", () => {
  it("getHealth hits /api/health", async () => {
    await getHealth("inst-1");
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/health", { instanceId: "inst-1" });
  });

  it("getCollections hits /api/collections", async () => {
    await getCollections();
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/collections", { instanceId: undefined });
  });

  it("getMediaCount omits the collectionId param for the all-collections total", async () => {
    mockRequest.mockResolvedValue(0);
    await getMediaCount();
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/collections/media/count", {
      params: undefined,
      instanceId: undefined,
      allowTextBody: true,
    });
  });

  it("getMediaCount passes collectionId when scoped to one collection", async () => {
    mockRequest.mockResolvedValue(0);
    await getMediaCount(7, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/collections/media/count", {
      params: { collectionId: 7 },
      instanceId: "inst-1",
      allowTextBody: true,
    });
  });
});

describe("getMediaCount coercion", () => {
  it("coerces a string count (the text/html transport shape) to a number", async () => {
    mockRequest.mockResolvedValue("42");
    await expect(getMediaCount()).resolves.toBe(42);
  });

  it("passes a numeric count straight through", async () => {
    mockRequest.mockResolvedValue(7);
    await expect(getMediaCount(3)).resolves.toBe(7);
  });
});

describe("getHealth degraded (503) handling", () => {
  it("returns the degraded body a 503 carries instead of rejecting", async () => {
    const degraded = { status: "degraded", database: "unreachable", uptimeSeconds: 1, timestamp: "" };
    mockRequest.mockRejectedValue(new HttpError(503, "Service Unavailable", "url", degraded));
    await expect(getHealth()).resolves.toEqual(degraded);
  });

  it("re-throws a non-503 error", async () => {
    const err = new HttpError(500, "Server Error", "url", { message: "boom" });
    mockRequest.mockRejectedValue(err);
    await expect(getHealth()).rejects.toBe(err);
  });
});

describe("getVersion (single-encoded status string)", () => {
  const version: MaintainerrVersion = {
    status: 1,
    version: "2.19.0",
    commitTag: "abc123",
    updateAvailable: false,
  };

  it("parses the JSON.stringify'd string upstream returns", async () => {
    mockRequest.mockResolvedValue(JSON.stringify(version));
    await expect(getVersion()).resolves.toEqual(version);
  });

  it("accepts an already-parsed object too", async () => {
    mockRequest.mockResolvedValue(version);
    await expect(getVersion()).resolves.toEqual(version);
  });
});

describe("parseVersionStatus", () => {
  const version: MaintainerrVersion = {
    status: 0,
    version: "2.18.1",
    commitTag: "def456",
    updateAvailable: true,
  };

  it("parses a JSON string", () => {
    expect(parseVersionStatus(JSON.stringify(version))).toEqual(version);
  });

  it("returns an object unchanged", () => {
    expect(parseVersionStatus(version)).toEqual(version);
  });

  it("does not throw on a non-JSON string (returns it as-is)", () => {
    // Defensive: a proxy error page etc. should not crash the caller.
    expect(() => parseVersionStatus("not json" as unknown as MaintainerrVersion)).not.toThrow();
  });
});

describe("summarizeCollections", () => {
  const collection = (over: Partial<MaintainerrCollection>): MaintainerrCollection =>
    ({ isActive: true, deleteAfterDays: 30, arrAction: 0, mediaCount: 0, ...over } as MaintainerrCollection);

  it("counts active collections and sums only media that will actually be acted on", () => {
    const collections = [
      collection({ mediaCount: 12 }), // active, has window, DELETE -> counts
      collection({ mediaCount: 5, deleteAfterDays: 90 }), // counts
      collection({ mediaCount: 3, deleteAfterDays: null }), // no deletion window -> excluded
      collection({ mediaCount: 7, arrAction: 4 }), // DO_NOTHING -> excluded
      collection({ isActive: false, mediaCount: 9 }), // inactive -> excluded from scheduled
    ];
    // 4 active collections; scheduled = 12 + 5 (the window+action ones only).
    expect(summarizeCollections(collections)).toEqual({ activeCollections: 4, totalScheduled: 17 });
  });

  it("is empty-safe", () => {
    expect(summarizeCollections([])).toEqual({ activeCollections: 0, totalScheduled: 0 });
  });

  it("counts an immediate action-7 collection even with no retention window", () => {
    // CHANGE_QUALITY_PROFILE acts immediately and its window is cleared, so it
    // must still count toward the scheduled total (#392 review).
    const collections = [collection({ mediaCount: 8, arrAction: 7, deleteAfterDays: null })];
    expect(summarizeCollections(collections)).toEqual({ activeCollections: 1, totalScheduled: 8 });
  });
});

describe("maintainerrActionLabel", () => {
  it("is the neutral no-action pair when there is no retention window", () => {
    expect(maintainerrActionLabel(0, null)).toEqual({ label: "No automatic action", icon: "none" });
  });

  it("is no-action for DO_NOTHING even with a window (nothing is promised)", () => {
    expect(maintainerrActionLabel(4, 30)).toEqual({ label: "No automatic action", icon: "none" });
  });

  it("says deletes (trash icon) for DELETE and DELETE_SHOW_IF_EMPTY", () => {
    expect(maintainerrActionLabel(0, 90)).toEqual({ label: "Auto-deletes after 90 days", icon: "delete" });
    expect(maintainerrActionLabel(5, 90)).toEqual({ label: "Auto-deletes after 90 days", icon: "delete" });
  });

  it("says unmonitors and deletes (trash icon) for the unmonitor+delete actions", () => {
    expect(maintainerrActionLabel(1, 30)).toEqual({
      label: "Unmonitors and deletes after 30 days",
      icon: "delete",
    });
    expect(maintainerrActionLabel(2, 30)).toEqual({
      label: "Unmonitors and deletes after 30 days",
      icon: "delete",
    });
  });

  it("says unmonitors (no deletion, eye-off icon) for UNMONITOR and UNMONITOR_SHOW_IF_EMPTY", () => {
    expect(maintainerrActionLabel(3, 14)).toEqual({ label: "Unmonitors after 14 days", icon: "unmonitor" });
    expect(maintainerrActionLabel(6, 14)).toEqual({ label: "Unmonitors after 14 days", icon: "unmonitor" });
  });

  it("labels the immediate quality-profile change with the real (7, null) shape", () => {
    expect(maintainerrActionLabel(7, null)).toEqual({
      label: "Changes quality profile immediately",
      icon: "quality",
    });
  });

  it("singularizes one day and falls back for an unknown action", () => {
    expect(maintainerrActionLabel(0, 1)).toEqual({ label: "Auto-deletes after 1 day", icon: "delete" });
    expect(maintainerrActionLabel(99, 5)).toEqual({ label: "Handled after 5 days", icon: "unmonitor" });
  });
});

describe("maintainerrHealthTone", () => {
  it("is ok only when both the app and the database are ok", () => {
    expect(maintainerrHealthTone({ status: "ok", database: "ok", uptimeSeconds: 1, timestamp: "" })).toBe("ok");
  });

  it("is degraded when the database is unreachable", () => {
    expect(
      maintainerrHealthTone({ status: "ok", database: "unreachable", uptimeSeconds: 1, timestamp: "" }),
    ).toBe("degraded");
  });

  it("is degraded when the app reports degraded", () => {
    expect(maintainerrHealthTone({ status: "degraded", database: "ok", uptimeSeconds: 1, timestamp: "" })).toBe(
      "degraded",
    );
  });

  it("is down when there is no health payload", () => {
    expect(maintainerrHealthTone(null)).toBe("down");
    expect(maintainerrHealthTone(undefined)).toBe("down");
  });
});
