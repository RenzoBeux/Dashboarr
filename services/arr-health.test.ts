// Mock native storage before importing — arr-health pulls in http-client →
// config-store → AsyncStorage/SecureStore at module load. The function under
// test is pure. Same shims as the other unit tests.
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
// -results branch is exercised through the same class production throws.
jest.mock("@/lib/http-client", () => ({
  ...jest.requireActual("@/lib/http-client"),
  serviceRequest: jest.fn(),
}));

import { HttpError, serviceRequest } from "@/lib/http-client";
import {
  ARR_HEALTH_SERVICE_IDS,
  describeTestAllOutcome,
  formatTestAllReport,
  testAllForHealthSource,
  testAllTargetForHealthSource,
  type ArrHealthServiceId,
} from "@/services/arr-health";

// The mapping tests only care about the route a source resolves to.
const pathFor = (kind: ArrHealthServiceId, source: string) =>
  testAllTargetForHealthSource(kind, source)?.path ?? null;

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
});

// The source → "Test all" mapping mirrors the upstream *arr Health pages
// (issue #268): a wrong path 404s against a real instance, and a button on an
// unmapped source would break upstream parity.
describe("testAllTargetForHealthSource", () => {
  it("maps indexer status checks on every *arr kind", () => {
    for (const kind of ["radarr", "sonarr", "prowlarr", "lidarr"] as const) {
      expect(pathFor(kind, "IndexerStatusCheck")).toBe("/indexer/testall");
      expect(pathFor(kind, "IndexerLongTermStatusCheck")).toBe("/indexer/testall");
      expect(pathFor(kind, "DownloadClientStatusCheck")).toBe(
        "/downloadclient/testall",
      );
    }
  });

  it("maps application status checks on Prowlarr only", () => {
    expect(pathFor("prowlarr", "ApplicationStatusCheck")).toBe(
      "/applications/testall",
    );
    expect(pathFor("prowlarr", "ApplicationLongTermStatusCheck")).toBe(
      "/applications/testall",
    );
    expect(pathFor("sonarr", "ApplicationStatusCheck")).toBe(null);
    expect(pathFor("radarr", "ApplicationStatusCheck")).toBe(null);
  });

  // Radarr/Sonarr/Lidarr's Health page offers Test All on DownloadClientCheck
  // ("Unable to communicate with <client>") as well as the status check;
  // Prowlarr's only wires the status check.
  it("maps DownloadClientCheck everywhere except Prowlarr", () => {
    for (const kind of ["radarr", "sonarr", "lidarr"] as const) {
      expect(pathFor(kind, "DownloadClientCheck")).toBe(
        "/downloadclient/testall",
      );
    }
    expect(pathFor("prowlarr", "DownloadClientCheck")).toBe(null);
  });

  it("returns null for sources without a test action", () => {
    expect(pathFor("radarr", "UpdateCheck")).toBe(null);
    expect(pathFor("radarr", "ImportListStatusCheck")).toBe(null);
    expect(pathFor("sonarr", "NotificationStatusCheck")).toBe(null);
    expect(pathFor("prowlarr", "IndexerRssCheck")).toBe(null);
  });
});

// Servarr's ProviderControllerBase.TestAll returns `BadRequest(result)` when any
// provider fails, so a 400 is the ordinary answer to pressing Test All on a
// failing health item — not a request error.
describe("testAllForHealthSource", () => {
  const mixedBody = [
    { id: 1, isValid: true, validationFailures: [] },
    {
      id: 4,
      isValid: false,
      validationFailures: [
        { propertyName: "", errorMessage: "Unable to connect to indexer" },
      ],
    },
  ];

  const badRequest = (body: unknown) =>
    new HttpError(400, "Bad Request", "http://x/api/v3/indexer/testall", body);

  it("unpacks the result list from a 400 and keeps every provider", async () => {
    mockRequest
      .mockRejectedValueOnce(badRequest(mixedBody))
      .mockResolvedValueOnce([
        { id: 1, name: "Healthy Indexer" },
        { id: 4, name: "Nyaa" },
      ]);

    const outcome = await testAllForHealthSource(
      "radarr",
      "IndexerStatusCheck",
      "inst-1",
    );

    expect(outcome).toEqual({
      noun: "indexer",
      nouns: "indexers",
      failed: 1,
      providers: [
        { id: 1, name: "Healthy Indexer", ok: true, message: "" },
        {
          id: 4,
          name: "Nyaa",
          ok: false,
          message: "Unable to connect to indexer",
        },
      ],
    });
    // Names come from the provider list at the same route minus /testall.
    expect(mockRequest.mock.calls[1][1]).toBe("/indexer");
  });

  it("falls back to #id when the provider list can't be read", async () => {
    mockRequest
      .mockRejectedValueOnce(badRequest(mixedBody))
      .mockRejectedValueOnce(new Error("boom"));

    const outcome = await testAllForHealthSource("radarr", "IndexerStatusCheck");
    expect(outcome.providers.map((p) => p.name)).toEqual(["#1", "#4"]);
  });

  it("names providers on a clean run too, since the report lists them", async () => {
    mockRequest
      .mockResolvedValueOnce([
        { id: 1, isValid: true, validationFailures: [] },
        { id: 2, isValid: true, validationFailures: [] },
      ])
      .mockResolvedValueOnce([
        { id: 1, name: "Alpha" },
        { id: 2, name: "Beta" },
      ]);

    const outcome = await testAllForHealthSource("sonarr", "IndexerStatusCheck");
    expect(outcome.failed).toBe(0);
    expect(outcome.providers.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("still throws when a 400 isn't the result list", async () => {
    const err = badRequest({ message: "Something else" });
    mockRequest.mockRejectedValueOnce(err);
    await expect(
      testAllForHealthSource("radarr", "IndexerStatusCheck"),
    ).rejects.toBe(err);
  });

  it("still throws on non-400 failures", async () => {
    const err = new HttpError(401, "Unauthorized", "http://x");
    mockRequest.mockRejectedValueOnce(err);
    await expect(
      testAllForHealthSource("radarr", "IndexerStatusCheck"),
    ).rejects.toBe(err);
  });

  it("treats an empty legacy body as a finished run, with no name lookup", async () => {
    mockRequest.mockResolvedValueOnce("");
    const outcome = await testAllForHealthSource("radarr", "IndexerStatusCheck");
    expect(outcome).toMatchObject({ providers: [], failed: 0 });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe("describeTestAllOutcome", () => {
  const base = { noun: "indexer", nouns: "indexers" };
  const ok = (id: number, name: string) => ({ id, name, ok: true, message: "" });
  const bad = (id: number, name: string, message: string) => ({
    id,
    name,
    ok: false,
    message,
  });

  it("summarizes a clean run", () => {
    expect(
      describeTestAllOutcome({
        ...base,
        failed: 0,
        providers: [ok(1, "A"), ok(2, "B")],
      }),
    ).toEqual({ ok: true, headline: "All 2 indexers passed" });
  });

  it("keeps the singular for a one-provider run", () => {
    expect(
      describeTestAllOutcome({ ...base, failed: 0, providers: [ok(1, "A")] }),
    ).toEqual({ ok: true, headline: "All 1 indexer passed" });
  });

  // Upstream skips disabled providers and ones whose settings don't validate,
  // so an empty run is a real answer rather than a silent success.
  it("says so when there was nothing eligible to test", () => {
    expect(
      describeTestAllOutcome({ ...base, failed: 0, providers: [] }),
    ).toEqual({ ok: true, headline: "No enabled indexers to test" });
  });

  it("counts failures without eliding any", () => {
    expect(
      describeTestAllOutcome({
        ...base,
        failed: 2,
        providers: [ok(1, "A"), bad(2, "B", "down"), bad(3, "C", "down")],
      }),
    ).toEqual({ ok: false, headline: "2 of 3 indexers failed" });
  });
});

describe("formatTestAllReport", () => {
  it("renders the whole run for the clipboard", () => {
    const report = formatTestAllReport({
      noun: "indexer",
      nouns: "indexers",
      failed: 1,
      providers: [
        { id: 1, name: "Alpha", ok: true, message: "" },
        { id: 2, name: "Beta", ok: false, message: "Unable to connect" },
      ],
    });
    expect(report).toBe(
      ["1 of 2 indexers failed", "OK   Alpha", "FAIL Beta: Unable to connect"].join(
        "\n",
      ),
    );
  });
});

describe("ARR_HEALTH_SERVICE_IDS", () => {
  it("covers exactly the four *arr kinds with an issue-array /health", () => {
    expect([...ARR_HEALTH_SERVICE_IDS].sort()).toEqual([
      "lidarr",
      "prowlarr",
      "radarr",
      "sonarr",
    ]);
  });

  it("omits bindery on purpose", () => {
    // Bindery's /health is a liveness probe ({status, version}), not an *arr
    // health-issue array, and it answers without an API key. Adding it here
    // would hand the Health Alerts card a shape it cannot render. This
    // assertion exists so the omission reads as deliberate rather than missed.
    expect(ARR_HEALTH_SERVICE_IDS).not.toContain("bindery" as never);
  });
});
