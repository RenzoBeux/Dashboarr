// Mock the http client entirely — cleanuparr-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import {
  getEvents,
  getStats,
  humanizeEnumName,
  triggerJob,
} from "@/services/cleanuparr-api";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

describe("getStats", () => {
  it("requests the v2 endpoint with the timeframe (v1 is sunset upstream)", async () => {
    await getStats(24, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("cleanuparr", "/api/v2/stats", {
      params: { hours: 24 },
      instanceId: "inst-1",
    });
  });

  it("defaults to the 7-day window", async () => {
    await getStats();
    expect(mockRequest.mock.calls[0][2].params).toEqual({ hours: 168 });
  });
});

describe("triggerJob", () => {
  it("POSTs the jobType as a path segment", async () => {
    await triggerJob("QueueCleaner", "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("cleanuparr", "/api/jobs/QueueCleaner/trigger", {
      method: "POST",
      instanceId: "inst-1",
    });
  });
});

describe("getEvents", () => {
  it("passes pagination and severity through", async () => {
    await getEvents({ page: 3, pageSize: 25, severity: "Warning" });
    expect(mockRequest.mock.calls[0][2].params).toEqual({
      page: 3,
      pageSize: 25,
      severity: "Warning",
    });
  });

  it("omits empty filters", async () => {
    await getEvents({});
    const params = mockRequest.mock.calls[0][2].params;
    expect(params).toEqual({ page: 1, pageSize: 25 });
    expect("severity" in params).toBe(false);
    expect("eventType" in params).toBe(false);
    expect("search" in params).toBe(false);
  });
});

describe("humanizeEnumName", () => {
  it.each([
    ["SlowSpeedStrike", "Slow speed strike"],
    ["QueueCleaner", "Queue cleaner"],
    ["FailedImportStrike", "Failed import strike"],
    ["MaxRatioReached", "Max ratio reached"],
    ["Stalled", "Stalled"],
  ])("%s → %s", (input, expected) => {
    expect(humanizeEnumName(input)).toBe(expected);
  });
});
