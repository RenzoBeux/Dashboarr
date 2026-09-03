// Mock the http client entirely — maintainerr-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
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
    await getMediaCount();
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/collections/media/count", {
      params: undefined,
      instanceId: undefined,
    });
  });

  it("getMediaCount passes collectionId when scoped to one collection", async () => {
    await getMediaCount(7, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("maintainerr", "/api/collections/media/count", {
      params: { collectionId: 7 },
      instanceId: "inst-1",
    });
  });
});

describe("getVersion (double-encoded status)", () => {
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
});

describe("maintainerrActionLabel", () => {
  it("is null when there is no retention window", () => {
    expect(maintainerrActionLabel(0, null)).toBeNull();
  });

  it("is null for DO_NOTHING even with a window (nothing is promised)", () => {
    expect(maintainerrActionLabel(4, 30)).toBeNull();
  });

  it("says deletes for DELETE and DELETE_SHOW_IF_EMPTY", () => {
    expect(maintainerrActionLabel(0, 90)).toBe("Auto-deletes after 90 days");
    expect(maintainerrActionLabel(5, 90)).toBe("Auto-deletes after 90 days");
  });

  it("says unmonitors and deletes for the unmonitor+delete actions", () => {
    expect(maintainerrActionLabel(1, 30)).toBe("Unmonitors and deletes after 30 days");
    expect(maintainerrActionLabel(2, 30)).toBe("Unmonitors and deletes after 30 days");
  });

  it("says unmonitors (no deletion) for UNMONITOR and UNMONITOR_SHOW_IF_EMPTY", () => {
    expect(maintainerrActionLabel(3, 14)).toBe("Unmonitors after 14 days");
    expect(maintainerrActionLabel(6, 14)).toBe("Unmonitors after 14 days");
  });

  it("names the quality-profile change", () => {
    expect(maintainerrActionLabel(7, 7)).toBe("Changes quality profile after 7 days");
  });

  it("singularizes one day and falls back for an unknown action", () => {
    expect(maintainerrActionLabel(0, 1)).toBe("Auto-deletes after 1 day");
    expect(maintainerrActionLabel(99, 5)).toBe("Handled after 5 days");
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
