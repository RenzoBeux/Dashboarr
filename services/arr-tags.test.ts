// Mock native storage before importing: arr-tags pulls in http-client, which
// loads config-store and with it AsyncStorage/SecureStore at module load. Same
// shims as the other service unit tests.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock("@/lib/http-client", () => ({
  ...jest.requireActual("@/lib/http-client"),
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { createArrTag } from "@/services/arr-tags";
import { getDemoResponse } from "@/lib/demo-data";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
});

describe("createArrTag", () => {
  it.each(["radarr", "sonarr", "lidarr"] as const)(
    "POSTs { label } to %s's /tag on the given instance",
    async (service) => {
      mockRequest.mockResolvedValue({ id: 7, label: "anime" });
      await expect(createArrTag(service, "anime", "inst-1")).resolves.toEqual({
        id: 7,
        label: "anime",
      });
      expect(mockRequest).toHaveBeenCalledWith(service, "/tag", {
        method: "POST",
        body: JSON.stringify({ label: "anime" }),
        instanceId: "inst-1",
      });
    },
  );

  it("rejects the tag LIST, which is what an unrouted POST would hand back", async () => {
    mockRequest.mockResolvedValue([{ id: 1, label: "4k" }]);
    await expect(createArrTag("radarr", "4k")).rejects.toThrow(
      "Unexpected response creating tag",
    );
  });

  it("rejects an empty or malformed body", async () => {
    mockRequest.mockResolvedValue(undefined);
    await expect(createArrTag("sonarr", "x")).rejects.toThrow();
    mockRequest.mockResolvedValue({ id: "7", label: "x" });
    await expect(createArrTag("sonarr", "x")).rejects.toThrow();
  });
});

describe("demo POST /tag", () => {
  it.each(["radarr", "sonarr", "lidarr"] as const)(
    "answers %s with one lowercased tag, not the fixture list",
    (service) => {
      const tag = getDemoResponse(
        service,
        "/tag",
        undefined,
        JSON.stringify({ label: "New-Tag" }),
        "POST",
      ) as { id: number; label: string };
      expect(Array.isArray(tag)).toBe(false);
      expect(tag.label).toBe("new-tag");
      expect(tag.id).toBeGreaterThanOrEqual(1000);
    },
  );

  it("hands out a fresh id per create", () => {
    const body = JSON.stringify({ label: "a" });
    const first = getDemoResponse("radarr", "/tag", undefined, body, "POST") as { id: number };
    const second = getDemoResponse("radarr", "/tag", undefined, body, "POST") as { id: number };
    expect(second.id).not.toBe(first.id);
  });

  it("still serves the list on GET", () => {
    expect(Array.isArray(getDemoResponse("sonarr", "/tag"))).toBe(true);
  });
});
