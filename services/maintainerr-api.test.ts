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
  const collections = [
    { isActive: true, mediaCount: 5 },
    { isActive: false, mediaCount: 3 },
    { isActive: true, mediaCount: 0 },
  ] as MaintainerrCollection[];

  it("counts active collections and sums scheduled media across all of them", () => {
    expect(summarizeCollections(collections)).toEqual({ activeCollections: 2, totalScheduled: 8 });
  });

  it("is empty-safe", () => {
    expect(summarizeCollections([])).toEqual({ activeCollections: 0, totalScheduled: 0 });
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
