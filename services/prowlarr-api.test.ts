// Mock native storage before importing — prowlarr-api pulls in http-client →
// config-store → AsyncStorage/SecureStore at module load. Same shims as the
// other unit tests.
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

// Only the transport is stubbed — HttpError has to stay real so the 400-carrying
// -failures branch is exercised through the same class production throws.
jest.mock("@/lib/http-client", () => ({
  ...jest.requireActual("@/lib/http-client"),
  serviceRequest: jest.fn(),
}));

import { HttpError, serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import { parseIndexerTestFailures, testIndexer } from "@/services/prowlarr-api";
import type { ProwlarrIndexer } from "@/lib/types";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
});

const INDEXER: ProwlarrIndexer = {
  id: 7,
  name: "TorrentLeech",
  protocol: "torrent",
  enable: true,
  priority: 25,
  added: "2026-01-01T00:00:00Z",
  fields: [{ name: "baseUrl", value: "https://example.invalid/" }],
  tags: [],
  appProfileId: 1,
};

const failure400 = (body: unknown) =>
  new HttpError(400, "Bad Request", "http://x/api/v1/indexer/test", body);

describe("testIndexer", () => {
  it("POSTs the full indexer to /indexer/test with the search timeout", async () => {
    mockRequest.mockResolvedValueOnce("{}");

    await expect(testIndexer(INDEXER, "inst-1")).resolves.toEqual({ ok: true });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const [kind, path, opts] = mockRequest.mock.calls[0];
    expect(kind).toBe("prowlarr");
    expect(path).toBe("/indexer/test");
    expect(opts.method).toBe("POST");
    expect(opts.instanceId).toBe("inst-1");
    expect(opts.timeout).toBe(INTERACTIVE_SEARCH_TIMEOUT);
    expect(JSON.parse(opts.body)).toEqual(INDEXER);
  });

  it("reads a 400 carrying the validation failures as a failed result", async () => {
    mockRequest.mockRejectedValueOnce(
      failure400([
        {
          propertyName: "",
          errorMessage: "Unable to connect to indexer, check the log for more details",
          severity: "error",
        },
        { propertyName: "baseUrl", errorMessage: " Query failed ", severity: "error" },
      ]),
    );

    await expect(testIndexer(INDEXER)).resolves.toEqual({
      ok: false,
      error:
        "Unable to connect to indexer, check the log for more details; Query failed",
    });
  });

  it("rethrows a 400 whose body is not a failure list", async () => {
    const err = failure400({ message: "Indexer not configured" });
    mockRequest.mockRejectedValueOnce(err);

    await expect(testIndexer(INDEXER)).rejects.toBe(err);
  });

  it("rethrows any other failure", async () => {
    const err = new HttpError(401, "Unauthorized", "http://x/api/v1/indexer/test");
    mockRequest.mockRejectedValueOnce(err);

    await expect(testIndexer(INDEXER)).rejects.toBe(err);
  });
});

describe("parseIndexerTestFailures", () => {
  it("joins the error messages", () => {
    expect(
      parseIndexerTestFailures([
        { errorMessage: "one" },
        { errorMessage: "two" },
      ]),
    ).toBe("one; two");
  });

  it("falls back to a generic message when the list carries no text", () => {
    expect(parseIndexerTestFailures([])).toBe("Test failed");
    expect(parseIndexerTestFailures([{ errorMessage: "  " }, {}])).toBe(
      "Test failed",
    );
  });

  it("returns null for anything that is not a failure list", () => {
    expect(parseIndexerTestFailures(undefined)).toBeNull();
    expect(parseIndexerTestFailures("Bad Request")).toBeNull();
    expect(parseIndexerTestFailures({ message: "nope" })).toBeNull();
    expect(parseIndexerTestFailures([1, null])).toBeNull();
  });
});
