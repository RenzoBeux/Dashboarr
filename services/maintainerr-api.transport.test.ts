// These tests drive the maintainerr-api wrappers through the REAL serviceRequest
// with a mocked fetch, so they exercise the actual wire format a live instance
// answers (content type + body), not a mocked serviceRequest. The sibling suite
// (maintainerr-api.test.ts) mocks serviceRequest and so cannot see transport
// bugs like the text/html content type Maintainerr stamps on its JSON payloads
// (#392 review round 4: getVersion/getMediaCount threw on every real instance).

// Break the config-store -> AsyncStorage import chain and feed serviceRequest a
// single enabled Maintainerr instance on an open-LAN URL.
const mockStateRef: { current: any } = { current: null };
jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: () => mockStateRef.current },
}));

import { getHealth, getMediaCount, getVersion } from "@/services/maintainerr-api";
import { AuthProxyResponseError } from "@/lib/http-client";
import type { MaintainerrVersion } from "@/lib/types";

const INSTANCE_ID = "maintainerr-uuid";

function makeState() {
  const inst = {
    id: INSTANCE_ID,
    enabled: true,
    name: "maintainerr",
    localUrl: "http://maintainerr.local:6246",
    remoteUrl: "",
    useRemote: false,
  };
  return {
    demoMode: false,
    serviceInstances: { maintainerr: [inst] },
    instanceSecrets: { [INSTANCE_ID]: {} },
    activeInstance: { maintainerr: INSTANCE_ID },
    globalCustomHeaders: {},
    getActiveInstanceId: () => INSTANCE_ID,
    getInstance: (_id: string, instanceId: string) => (instanceId === INSTANCE_ID ? inst : undefined),
    getActiveUrl: () => inst.localUrl,
    getMergedHeaders: () => ({}),
  };
}

// A mock Response with sensible defaults; pass overrides per test.
function respond(over: Record<string, any>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: async () => ({}),
    text: async () => "",
    clone() {
      return this;
    },
    ...over,
  };
}

let originalFetch: typeof global.fetch;
let fetchSpy: jest.Mock;

beforeEach(() => {
  originalFetch = global.fetch;
  fetchSpy = jest.fn();
  global.fetch = fetchSpy as any;
  mockStateRef.current = makeState();
});

afterEach(() => {
  global.fetch = originalFetch;
});

const version: MaintainerrVersion = {
  status: 1,
  version: "2.19.0",
  commitTag: "abc123",
  updateAvailable: true,
};

describe("getVersion over the real transport", () => {
  it("parses a 200 text/html body carrying JSON.stringify(status)", async () => {
    // Upstream getAppStatus() returns JSON.stringify(...), and Express res.send
    // stamps text/html. Without allowTextBody this used to throw AuthProxyResponseError.
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => JSON.stringify(version),
      }),
    );
    await expect(getVersion()).resolves.toEqual(version);
  });

  it("still catches a genuine proxy login page (text/html HTML body)", async () => {
    // allowTextBody skips the content-type short-circuit, but the body-head sniff
    // still flags an actual HTML document, so a proxy in front is not swallowed.
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<!DOCTYPE html><html><body>Sign in</body></html>",
      }),
    );
    await expect(getVersion()).rejects.toBeInstanceOf(AuthProxyResponseError);
  });
});

describe("getMediaCount over the real transport", () => {
  it("coerces a text/html numeric body back to a number", async () => {
    // A bare number goes through res.send as the string "42" with text/html.
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => "42",
      }),
    );
    await expect(getMediaCount()).resolves.toBe(42);
  });
});

describe("getHealth over the real transport", () => {
  it("returns the degraded body from a 503 instead of rejecting", async () => {
    // GET /api/health mirrors /ready, which answers 503 with the degraded
    // HealthResponse as its body when the database is unreachable.
    const degraded = {
      status: "degraded",
      database: "unreachable",
      uptimeSeconds: 12,
      timestamp: "2026-09-05T00:00:00.000Z",
    };
    fetchSpy.mockResolvedValueOnce(
      respond({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => degraded,
      }),
    );
    await expect(getHealth()).resolves.toEqual(degraded);
  });

  it("rejects on a non-503 error", async () => {
    fetchSpy.mockResolvedValueOnce(
      respond({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "boom" }),
      }),
    );
    await expect(getHealth()).rejects.toBeTruthy();
  });
});
