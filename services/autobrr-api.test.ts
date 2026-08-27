// Mock the http client entirely — autobrr-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import {
  findReleases,
  restartIrcNetwork,
  retryReleasePush,
  setFilterEnabled,
} from "@/services/autobrr-api";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

describe("findReleases", () => {
  it("sends q and push_status when set", async () => {
    await findReleases({ q: "ubuntu", pushStatus: "PUSH_APPROVED" }, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("autobrr", "/release", {
      params: { limit: 30, offset: 0, q: "ubuntu", push_status: "PUSH_APPROVED" },
      instanceId: "inst-1",
    });
  });

  it("omits q and push_status when empty — autobrr 400s on an invalid push_status", async () => {
    await findReleases({ q: "" });
    const params = mockRequest.mock.calls[0][2].params;
    expect(params).toEqual({ limit: 30, offset: 0 });
    expect("q" in params).toBe(false);
    expect("push_status" in params).toBe(false);
  });

  it("passes explicit limit/offset through", async () => {
    await findReleases({ limit: 50, offset: 100 });
    expect(mockRequest.mock.calls[0][2].params).toEqual({ limit: 50, offset: 100 });
  });
});

describe("retryReleasePush", () => {
  it("POSTs to the release/action retry route", async () => {
    await retryReleasePush(12, 34, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith(
      "autobrr",
      "/release/12/actions/34/retry",
      { method: "POST", instanceId: "inst-1" },
    );
  });
});

describe("setFilterEnabled", () => {
  it("PUTs the {enabled} body autobrr expects", async () => {
    await setFilterEnabled(7, false);
    expect(mockRequest).toHaveBeenCalledWith("autobrr", "/filters/7/enabled", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
      instanceId: undefined,
    });
  });
});

describe("restartIrcNetwork", () => {
  it("uses autobrr's mutating GET restart route (no method override)", async () => {
    await restartIrcNetwork(3, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("autobrr", "/irc/network/3/restart", {
      instanceId: "inst-1",
    });
  });
});
