// Mock the http client entirely — pihole-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment. HttpError has
// to be a real class because piholeRequest does `err instanceof HttpError`.
jest.mock("@/lib/http-client", () => {
  // Plain field assignments, not TS parameter properties: babel-plugin-jest-hoist
  // rejects those inside a module factory.
  class HttpError extends Error {
    status: number;
    statusText: string;
    url: string;
    body?: unknown;
    constructor(status: number, statusText: string, url: string, body?: unknown) {
      super(`HTTP ${status} ${statusText}`);
      this.name = "HttpError";
      this.status = status;
      this.statusText = statusText;
      this.url = url;
      this.body = body;
    }
  }
  return { serviceRequest: jest.fn(), HttpError };
});

jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: jest.fn() },
}));

import { HttpError, serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { resetPiholeSessions } from "@/lib/pihole-session";
import { parseCnameRecord } from "@/lib/pihole-normalize";
import {
  addCnameRecord,
  deleteCnameRecord,
  getBlocking,
  getCnameRecords,
  getHistory,
  getQueries,
  getSummary,
  getTopDomains,
  piholeClearSession,
  runGravity,
  setBlocking,
} from "@/services/pihole-api";

const mockRequest = serviceRequest as jest.Mock;
const mockGetState = useConfigStore.getState as jest.Mock;

const INSTANCE = "inst-1";
const SID = "vFA+EP4MQ5JJvJg+3Q2Jnw=";

function setStore(overrides: Record<string, unknown> = {}) {
  mockGetState.mockReturnValue({
    demoMode: false,
    getActiveInstanceId: () => INSTANCE,
    instanceSecrets: { [INSTANCE]: { password: "hunter2" } },
    getActiveUrl: () => "http://pi.hole",
    ...overrides,
  });
}

/** Answer /auth with a session, everything else with `data`. */
function respondWithLogin(data: unknown = {}, sid: string | null = SID) {
  mockRequest.mockImplementation((_svc: string, path: string) => {
    if (path === "/auth") {
      return Promise.resolve({ session: { valid: true, sid, totp: false } });
    }
    return Promise.resolve(data);
  });
}

const authCalls = () => mockRequest.mock.calls.filter((c) => c[1] === "/auth");
const dataCalls = () => mockRequest.mock.calls.filter((c) => c[1] !== "/auth");

beforeEach(() => {
  mockRequest.mockReset();
  resetPiholeSessions();
  setStore();
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

describe("session handling", () => {
  // THE invariant. FTL's webserver.api.max_sessions defaults to 16, and opening
  // the Pi-hole screen fires ~6 queries in one tick. Without de-duplication a
  // single render spends 6 of the 16 available seats.
  it("issues exactly one login for many concurrent calls", async () => {
    respondWithLogin();
    await Promise.all([
      getSummary(),
      getBlocking(),
      getHistory(),
      getTopDomains(),
      getCnameRecords(),
    ]);
    expect(authCalls()).toHaveLength(1);
    expect(dataCalls()).toHaveLength(5);
  });

  it("reuses the cached session across later calls", async () => {
    respondWithLogin();
    await getSummary();
    await getBlocking();
    await getSummary();
    expect(authCalls()).toHaveLength(1);
  });

  it("sends X-FTL-SID on data calls but not on the login itself", async () => {
    respondWithLogin();
    await getSummary();
    expect(authCalls()[0]![2].headers).toBeUndefined();
    expect(dataCalls()[0]![2].headers).toEqual({ "X-FTL-SID": SID });
  });

  it("posts the configured password to /auth", async () => {
    respondWithLogin();
    await getSummary();
    expect(authCalls()[0]![2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ password: "hunter2" }),
    });
  });

  // A password-less Pi-hole answers {valid:true, sid:null}. Caching truthiness
  // on the SID would re-log in on every single request forever.
  it("treats a null sid as a real session and sends no header", async () => {
    respondWithLogin({}, null);
    await getSummary();
    await getSummary();
    expect(authCalls()).toHaveLength(1);
    expect(dataCalls()[0]![2].headers).toBeUndefined();
    expect(dataCalls()[1]![2].headers).toBeUndefined();
  });

  it("re-logs in exactly once after a 401, then succeeds", async () => {
    let dataAttempts = 0;
    mockRequest.mockImplementation((_svc: string, path: string) => {
      if (path === "/auth") {
        return Promise.resolve({ session: { valid: true, sid: SID } });
      }
      dataAttempts += 1;
      if (dataAttempts === 1) {
        return Promise.reject(new HttpError(401, "Unauthorized", "u"));
      }
      return Promise.resolve({ ok: true });
    });
    await expect(getSummary()).resolves.toEqual({ ok: true });
    expect(authCalls()).toHaveLength(2);
    expect(dataAttempts).toBe(2);
  });

  // Looping on a genuine rejection would spend a seat per attempt.
  it("propagates a second 401 instead of looping", async () => {
    mockRequest.mockImplementation((_svc: string, path: string) => {
      if (path === "/auth") {
        return Promise.resolve({ session: { valid: true, sid: SID } });
      }
      return Promise.reject(new HttpError(401, "Unauthorized", "u"));
    });
    await expect(getSummary()).rejects.toThrow("HTTP 401");
    expect(authCalls()).toHaveLength(2);
  });

  it("does not retry a non-401 failure", async () => {
    mockRequest.mockImplementation((_svc: string, path: string) => {
      if (path === "/auth") {
        return Promise.resolve({ session: { valid: true, sid: SID } });
      }
      return Promise.reject(new HttpError(500, "Server Error", "u"));
    });
    await expect(getSummary()).rejects.toThrow("HTTP 500");
    expect(dataCalls()).toHaveLength(1);
  });

  it("surfaces FTL's nested error message when the password is rejected", async () => {
    mockRequest.mockImplementation((_svc: string, path: string) => {
      if (path === "/auth") {
        return Promise.reject(
          new HttpError(401, "Unauthorized", "u", {
            error: { key: "unauthorized", message: "Invalid password" },
          }),
        );
      }
      return Promise.resolve({});
    });
    await expect(getSummary()).rejects.toThrow("Invalid password");
  });

  it("reports seat exhaustion as its own problem, not a bad password", async () => {
    mockRequest.mockImplementation((_svc: string, path: string) => {
      if (path === "/auth") {
        return Promise.reject(
          new HttpError(401, "Unauthorized", "u", {
            error: { key: "api_seats_exceeded", message: "Unauthorized" },
          }),
        );
      }
      return Promise.resolve({});
    });
    await expect(getSummary()).rejects.toThrow(/no free API sessions/i);
  });

  it("rejects when the session comes back invalid", async () => {
    mockRequest.mockImplementation((_svc: string, path: string) =>
      path === "/auth"
        ? Promise.resolve({ session: { valid: false, message: "Wrong password" } })
        : Promise.resolve({}),
    );
    await expect(getSummary()).rejects.toThrow("Wrong password");
  });

  // Leaking a seat on every credential change is not free with only 16 of them.
  it("logs the session out on clear, and re-logs in afterwards", async () => {
    respondWithLogin();
    await getSummary();
    await piholeClearSession(INSTANCE);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://pi.hole/api/auth",
      expect.objectContaining({
        method: "DELETE",
        headers: { "X-FTL-SID": SID },
      }),
    );

    await getSummary();
    expect(authCalls()).toHaveLength(2);
  });
});

describe("demo mode", () => {
  // enableDemoMode clears instanceSecrets, so a handshake here would post an
  // empty password at a host that does not exist and hang for the full timeout.
  it("short-circuits before any login handshake", async () => {
    setStore({ demoMode: true });
    mockRequest.mockResolvedValue({ queries: { total: 1 } });
    await getSummary();
    expect(authCalls()).toHaveLength(0);
    expect(mockRequest).toHaveBeenCalledWith("pihole", "/stats/summary", {});
  });
});

describe("blocking", () => {
  it("POSTs the blocking flag and timer", async () => {
    respondWithLogin({ blocking: "disabled", timer: 60 });
    await expect(setBlocking(false, 60)).resolves.toEqual({
      blocking: "disabled",
      timer: 60,
    });
    const call = dataCalls()[0]!;
    expect(call[1]).toBe("/dns/blocking");
    expect(call[2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ blocking: false, timer: 60 }),
    });
  });

  it("sends a null timer for a permanent change", async () => {
    respondWithLogin({ blocking: "enabled", timer: null });
    await setBlocking(true, null);
    expect(dataCalls()[0]![2].body).toBe(
      JSON.stringify({ blocking: true, timer: null }),
    );
  });
});

describe("gravity", () => {
  const SUCCESS_LOG = [
    "  [✓] Swapping databases",
    "  [i] Number of gravity domains: 219,727 (215,440 unique domains)",
  ].join("\n");

  it("POSTs with the long timeout and parses the plain-text verdict", async () => {
    respondWithLogin(SUCCESS_LOG);
    const result = await runGravity();
    expect(result.status).toBe("success");
    expect(result.domainCount).toBe(219727);
    expect(dataCalls()[0]![2]).toMatchObject({
      method: "POST",
      timeout: 300_000,
    });
  });

  it("reports an unreachable blocklist as partial", async () => {
    respondWithLogin(`  [✗] Status: Connection Refused\n${SUCCESS_LOG}`);
    const result = await runGravity();
    expect(result.status).toBe("partial");
    expect(result.failures).toEqual(["Status: Connection Refused"]);
  });

  it("survives a non-string body", async () => {
    respondWithLogin(undefined);
    await expect(runGravity()).resolves.toMatchObject({ status: "failed" });
  });
});

describe("stats", () => {
  it("passes blocked and count to top_domains", async () => {
    respondWithLogin({ domains: [] });
    await getTopDomains({ blocked: true, count: 5 });
    expect(dataCalls()[0]![2].params).toEqual({ blocked: true, count: 5 });
  });

  it("defaults top_domains to permitted, 10 items", async () => {
    respondWithLogin({ domains: [] });
    await getTopDomains();
    expect(dataCalls()[0]![2].params).toEqual({ blocked: false, count: 10 });
  });

  it("normalizes history into ms-stamped points", async () => {
    respondWithLogin({
      history: [
        { timestamp: 1511819900, total: 10, cached: 2, blocked: 3, forwarded: 5 },
      ],
    });
    await expect(getHistory()).resolves.toEqual([
      { timestampMs: 1511819900000, total: 10, cached: 2, blocked: 3, forwarded: 5 },
    ]);
  });
});

describe("query filters", () => {
  it("maps camelCase filters onto FTL's snake_case wire names", async () => {
    respondWithLogin({ queries: [] });
    await getQueries({ clientIp: "192.168.1.4", clientName: "nas", length: 50 });
    expect(dataCalls()[0]![2].params).toEqual({
      client_ip: "192.168.1.4",
      client_name: "nas",
      length: 50,
    });
  });

  // An empty `domain=` is a real filter to FTL ("domains equal to ''"), not
  // "no filter", so blank and undefined keys must be dropped entirely.
  it("omits undefined and empty filters", async () => {
    respondWithLogin({ queries: [] });
    await getQueries({ domain: "", status: undefined, length: 100 });
    expect(dataCalls()[0]![2].params).toEqual({ length: 100 });
  });

  // Booleans pass through as-is rather than being treated as absent — an
  // explicit `false` is meaningful (top_domains sends blocked:false to mean
  // "permitted"), and it matches FTL's own defaults either way.
  it("passes boolean filters through in both states", async () => {
    respondWithLogin({ queries: [] });
    await getQueries({ disk: true });
    expect(dataCalls()[0]![2].params).toEqual({ disk: true });

    mockRequest.mockClear();
    respondWithLogin({ queries: [] });
    await getQueries({ disk: false });
    expect(dataCalls()[0]![2].params).toEqual({ disk: false });
  });
});

describe("CNAME records", () => {
  it("reads FTL's nested config subtree", async () => {
    respondWithLogin({
      config: { dns: { cnameRecords: ["nas.lan,server.lan", "a.com,b.com,60"] } },
    });
    const records = await getCnameRecords();
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ cname: "a.com", target: "b.com", ttl: 60 });
  });

  it("PUTs a percent-encoded value, leaving a wildcard readable", async () => {
    respondWithLogin();
    await addCnameRecord({ cname: "*.example.com", target: "default.example.com" });
    const call = dataCalls()[0]!;
    expect(call[1]).toBe(
      "/config/dns/cnameRecords/*.example.com%2Cdefault.example.com",
    );
    expect(call[2].method).toBe("PUT");
  });

  it("includes the TTL as a third encoded segment", async () => {
    respondWithLogin();
    await addCnameRecord({ cname: "a.com", target: "b.com", ttl: 3600 });
    expect(dataCalls()[0]![1]).toBe("/config/dns/cnameRecords/a.com%2Cb.com%2C3600");
  });

  // FTL matches the delete path against the stored array byte-for-byte, so a
  // re-formatted value 404s while the record stays in the config.
  it("deletes using the raw stored string, not a normalized one", async () => {
    respondWithLogin();
    const record = parseCnameRecord("a.com , b.com")!;
    await deleteCnameRecord(record);
    const call = dataCalls()[0]!;
    expect(call[1]).toBe("/config/dns/cnameRecords/a.com%20%2C%20b.com");
    expect(call[2].method).toBe("DELETE");
  });
});
