// Mock the http client entirely — custom-api routes every real (non-login)
// call through serviceRequest, and mocking the module here also stops the
// config-store / AsyncStorage import chain from loading in the test
// environment. HttpError has to be a real class because custom-api does
// `err instanceof HttpError`. buildUrl is reimplemented trivially (its real
// behavior isn't under test here — lib/url-builder.test.ts covers it).
jest.mock("@/lib/http-client", () => {
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
  return {
    serviceRequest: jest.fn(),
    buildUrl: (base: string, apiBasePath: string, path: string) => `${base}${apiBasePath}${path}`,
    HttpError,
  };
});

jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: jest.fn() },
}));

import { HttpError, serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import {
  buildRequest,
  checkHealth,
  clearCustomServiceCache,
  getStats,
  resetCustomServiceCache,
  runAction,
} from "@/services/custom-api";
import type { CustomServiceDefinition, CustomServiceLogin } from "@/lib/custom-service";

const mockRequest = serviceRequest as jest.Mock;
const mockGetState = useConfigStore.getState as jest.Mock;
const mockFetch = () => global.fetch as jest.Mock;

const INSTANCE = "inst-1";

function setStore(
  def: CustomServiceDefinition,
  baseUrl = "http://custom.local",
  mergedHeaders: Record<string, string> = {},
) {
  mockGetState.mockReturnValue({
    getInstance: () => ({ id: INSTANCE, enabled: true, custom: def }),
    getActiveUrl: () => baseUrl,
    getMergedHeaders: () => mergedHeaders,
  });
}

interface MockResponseOpts {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
  setCookie?: string | null;
}

function mockLoginResponse(opts: MockResponseOpts = {}): Response {
  const { ok = true, status = 200, jsonBody, setCookie = null } = opts;
  const response = {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: { get: (name: string) => (name.toLowerCase() === "set-cookie" ? setCookie : null) },
    json: async () => jsonBody,
    clone(): unknown {
      return this;
    },
  };
  return response as unknown as Response;
}

beforeEach(() => {
  mockRequest.mockReset();
  resetCustomServiceCache();
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe("buildRequest — auth modes", () => {
  it("mode 'none' (or absent) sends no auth", () => {
    expect(buildRequest({}, "/s", { method: "GET" }).headers).toEqual({});
    expect(
      buildRequest({ auth: { mode: "none" } }, "/s", { method: "GET" }).headers,
    ).toEqual({});
  });

  it("mode 'header' sets the configured header name/value", () => {
    const spec = buildRequest(
      { auth: { mode: "header", headerName: "X-Api-Key", token: "secret" } },
      "/s",
      { method: "GET" },
    );
    expect(spec.headers).toEqual({ "X-Api-Key": "secret" });
    expect(spec.params).toBeUndefined();
  });

  it("mode 'query' sets the configured query param", () => {
    const spec = buildRequest(
      { auth: { mode: "query", queryParam: "apikey", token: "secret" } },
      "/s",
      { method: "GET" },
    );
    expect(spec.params).toEqual({ apikey: "secret" });
    expect(spec.headers).toEqual({});
  });

  it("mode 'basic' sets a Basic Authorization header", () => {
    const spec = buildRequest(
      { auth: { mode: "basic", username: "user", password: "pass" } },
      "/s",
      { method: "GET" },
    );
    expect(spec.headers.Authorization).toMatch(/^Basic /);
  });

  it("mode 'bearer' sets a Bearer Authorization header", () => {
    const spec = buildRequest({ auth: { mode: "bearer", token: "tok123" } }, "/s", {
      method: "GET",
    });
    expect(spec.headers).toEqual({ Authorization: "Bearer tok123" });
  });

  it("passes method/body/content-type through", () => {
    const spec = buildRequest({}, "/s", {
      method: "POST",
      body: '{"a":1}',
      contentType: "application/json",
    });
    expect(spec.method).toBe("POST");
    expect(spec.body).toBe('{"a":1}');
    expect(spec.headers["Content-Type"]).toBe("application/json");
  });
});

describe("buildRequest — capture injection", () => {
  const baseLogin: CustomServiceLogin = {
    method: "POST",
    path: "/login",
    injectAs: "header",
    injectName: "X-Token",
  };

  it("injects a header capture", () => {
    const spec = buildRequest({ login: baseLogin }, "/s", {
      method: "GET",
      capture: { value: "abc" },
    });
    expect(spec.headers).toEqual({ "X-Token": "abc" });
  });

  it("injects a query capture", () => {
    const spec = buildRequest(
      { login: { ...baseLogin, injectAs: "query", injectName: "token" } },
      "/s",
      { method: "GET", capture: { value: "abc" } },
    );
    expect(spec.params).toEqual({ token: "abc" });
  });

  it("injects a bearer capture as Authorization", () => {
    const spec = buildRequest(
      { login: { ...baseLogin, injectAs: "bearer" } },
      "/s",
      { method: "GET", capture: { value: "abc" } },
    );
    expect(spec.headers).toEqual({ Authorization: "Bearer abc" });
  });

  it("injects a cookie capture under injectName when set", () => {
    const spec = buildRequest(
      { login: { ...baseLogin, injectAs: "cookie", injectName: "SID" } },
      "/s",
      { method: "GET", capture: { value: "abc", cookieName: "QBT_SID_8080" } },
    );
    // injectName wins over the captured real cookie name when both are set.
    expect(spec.headers).toEqual({ Cookie: "SID=abc" });
  });

  it("falls back to the captured cookie's real name when injectName is empty", () => {
    const spec = buildRequest(
      { login: { ...baseLogin, injectAs: "cookie", injectName: undefined } },
      "/s",
      { method: "GET", capture: { value: "abc", cookieName: "QBT_SID_8080" } },
    );
    expect(spec.headers).toEqual({ Cookie: "QBT_SID_8080=abc" });
  });

  it("falls back to 'session' when neither injectName nor a captured cookie name is available", () => {
    const spec = buildRequest(
      { login: { ...baseLogin, injectAs: "cookie", injectName: undefined } },
      "/s",
      { method: "GET", capture: { value: "abc" } },
    );
    expect(spec.headers).toEqual({ Cookie: "session=abc" });
  });

  it("skips capture injection when capture is null or absent", () => {
    expect(
      buildRequest({ login: baseLogin }, "/s", { method: "GET", capture: null }).headers,
    ).toEqual({});
    expect(buildRequest({ login: baseLogin }, "/s", { method: "GET" }).headers).toEqual({});
  });

  it("is additive with the primary auth", () => {
    const spec = buildRequest(
      {
        auth: { mode: "header", headerName: "X-Api-Key", token: "static" },
        login: baseLogin,
      },
      "/s",
      { method: "GET", capture: { value: "abc" } },
    );
    expect(spec.headers).toEqual({ "X-Api-Key": "static", "X-Token": "abc" });
  });
});

describe("checkHealth — auth applied to the real request", () => {
  it("applies header auth to the health request options", async () => {
    setStore({
      auth: { mode: "header", headerName: "X-Api-Key", token: "secret" },
      health: { method: "GET", path: "/status", statusPath: "status", okValues: ["ok"] },
    });
    mockRequest.mockResolvedValue({ status: "ok" });
    await checkHealth(INSTANCE);
    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        method: "GET",
        headers: { "X-Api-Key": "secret" },
        instanceId: INSTANCE,
      }),
    );
  });

  it("sends a POST health check with its body and JSON content type", async () => {
    setStore({ health: { method: "POST", path: "/check", body: '{"ping":true}' } });
    mockRequest.mockResolvedValue({});
    await checkHealth(INSTANCE);
    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/check",
      expect.objectContaining({
        method: "POST",
        body: '{"ping":true}',
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });
});

describe("checkHealth — status/version mapping", () => {
  it("matches a JSON boolean status against string okValues, case-insensitively (AzuraCast online:true)", async () => {
    setStore({ health: { method: "GET", path: "/np", statusPath: "online", okValues: ["true"] } });
    mockRequest.mockResolvedValue({ online: true });
    expect(await checkHealth(INSTANCE)).toEqual({ online: true, status: "ok", version: undefined });
  });

  it("maps a warn value case-insensitively", async () => {
    setStore({
      health: {
        method: "GET",
        path: "/s",
        statusPath: "state",
        okValues: ["ok"],
        warnValues: ["degraded"],
      },
    });
    mockRequest.mockResolvedValue({ state: "Degraded" });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("warning");
    expect(result.online).toBe(true);
  });

  it("maps an unrecognized status to offline", async () => {
    setStore({ health: { method: "GET", path: "/s", statusPath: "state", okValues: ["ok"] } });
    mockRequest.mockResolvedValue({ state: "down" });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("offline");
    expect(result.online).toBe(false);
  });

  it("treats any reachable response as ok when no ok/warn lists are configured", async () => {
    setStore({ health: { method: "GET", path: "/s" } });
    mockRequest.mockResolvedValue({ anything: 1 });
    expect((await checkHealth(INSTANCE)).status).toBe("ok");
  });

  // statusPath IS set here (unlike the test above, which has none at all) but
  // both okValues/warnValues are empty — a non-empty extracted value still
  // reads as reachable/healthy.
  it("treats a non-empty status value as ok when statusPath is set but both ok/warn lists are empty", async () => {
    setStore({ health: { method: "GET", path: "/s", statusPath: "state" } });
    mockRequest.mockResolvedValue({ state: "anything" });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("ok");
    expect(result.online).toBe(true);
  });

  it("treats a missing statusPath value as offline when both ok/warn lists are empty", async () => {
    setStore({ health: { method: "GET", path: "/s", statusPath: "state" } });
    mockRequest.mockResolvedValue({ somethingElse: 1 });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("offline");
    expect(result.online).toBe(false);
  });

  it("treats an empty-string statusPath value as offline when both ok/warn lists are empty", async () => {
    setStore({ health: { method: "GET", path: "/s", statusPath: "state" } });
    mockRequest.mockResolvedValue({ state: "" });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("offline");
    expect(result.online).toBe(false);
  });

  // Unchanged-behavior control: with okValues configured, a non-matching
  // value is still offline regardless of the empty-lists fallback above.
  it("still maps a non-matching status to offline when okValues is configured (unchanged)", async () => {
    setStore({ health: { method: "GET", path: "/s", statusPath: "state", okValues: ["ok"] } });
    mockRequest.mockResolvedValue({ state: "nope" });
    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("offline");
    expect(result.online).toBe(false);
  });

  it("extracts a version via versionPath", async () => {
    setStore({ health: { method: "GET", path: "/s", versionPath: "app.version" } });
    mockRequest.mockResolvedValue({ app: { version: "1.2.3" } });
    expect((await checkHealth(INSTANCE)).version).toBe("1.2.3");
  });

  it("reports offline with a message when the request throws", async () => {
    setStore({ health: { method: "GET", path: "/s" } });
    mockRequest.mockRejectedValue(new Error("boom"));
    expect(await checkHealth(INSTANCE)).toEqual({
      online: false,
      status: "offline",
      message: "boom",
    });
  });

  it("reports offline when no health check is configured", async () => {
    setStore({});
    expect((await checkHealth(INSTANCE)).status).toBe("offline");
  });
});

describe("checkHealth — resolveInstance error paths", () => {
  it("rejects when the instance is not found", async () => {
    mockGetState.mockReturnValue({ getInstance: () => undefined, getActiveUrl: () => "http://x" });
    await expect(checkHealth(INSTANCE)).rejects.toThrow(/not found/);
  });

  it("rejects when no URL is configured", async () => {
    mockGetState.mockReturnValue({
      getInstance: () => ({ id: INSTANCE, custom: {} }),
      getActiveUrl: () => "",
    });
    await expect(checkHealth(INSTANCE)).rejects.toThrow(/No URL configured/);
  });
});

describe("getStats", () => {
  it("extracts and formats every configured stat from the health response", async () => {
    setStore({
      health: { method: "GET", path: "/np" },
      stats: [
        { label: "Listeners", path: "listeners.total", format: "number" },
        { label: "Uptime", path: "uptime", format: "duration" },
        { label: "Disk used", path: "disk.used", format: "bytes" },
        { label: "CPU", path: "cpu", format: "percent" },
        { label: "Genre", path: "genre" },
      ],
    });
    mockRequest.mockResolvedValue({
      listeners: { total: 1234 },
      uptime: 3725,
      disk: { used: 1572864 },
      cpu: 42.5,
      genre: "House",
    });
    expect(await getStats(INSTANCE)).toEqual([
      { label: "Listeners", raw: 1234, display: "1,234", unit: undefined },
      { label: "Uptime", raw: 3725, display: "1h 2m", unit: undefined },
      { label: "Disk used", raw: 1572864, display: "1.5 MiB", unit: undefined },
      { label: "CPU", raw: 42.5, display: "42.5%", unit: undefined },
      { label: "Genre", raw: "House", display: "House", unit: undefined },
    ]);
  });

  it("returns an empty array when no stats are configured", async () => {
    setStore({});
    expect(await getStats(INSTANCE)).toEqual([]);
  });

  it("never throws formatting a non-numeric duration (Cleanuparr's .NET TimeSpan upTime)", async () => {
    setStore({
      health: { method: "GET", path: "/s" },
      stats: [{ label: "Up", path: "upTime", format: "duration" }],
    });
    mockRequest.mockResolvedValue({ upTime: "0.12:34:56.789" });
    const stats = await getStats(INSTANCE);
    expect(stats[0]).toEqual({
      label: "Up",
      raw: "0.12:34:56.789",
      display: "0.12:34:56.789",
      unit: undefined,
    });
  });
});

describe("runAction", () => {
  it("calls the configured action and returns status 200 + body on success", async () => {
    setStore({ actions: [{ id: "restart", label: "Restart", method: "POST", path: "/restart" }] });
    mockRequest.mockResolvedValue({ ok: true });
    const result = await runAction(INSTANCE, "restart");
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/restart",
      expect.objectContaining({ method: "POST", instanceId: INSTANCE }),
    );
  });

  it("returns the HTTP status and body instead of throwing on a failed action", async () => {
    setStore({ actions: [{ id: "restart", label: "Restart", method: "POST", path: "/restart" }] });
    mockRequest.mockRejectedValue(new HttpError(400, "Bad Request", "url", { error: "nope" }));
    expect(await runAction(INSTANCE, "restart")).toEqual({ status: 400, body: { error: "nope" } });
  });

  it("throws for an unknown action id", async () => {
    setStore({ actions: [] });
    await expect(runAction(INSTANCE, "missing")).rejects.toThrow(/Unknown action/);
  });
});

// Live-proof: qBittorrent v5.2.3's POST /api/v2/torrents/stop with body
// "hashes=all" returns 400 sent as application/json and 200 as
// application/x-www-form-urlencoded — the definition gives no contentType
// for health/stats/action bodies (only login has that field), so it must be
// inferred from the body's own shape, not hardcoded to JSON.
describe("content-type inference for health/stats/action bodies", () => {
  it("infers form-urlencoded for a non-JSON action body (hashes=all)", async () => {
    setStore({
      actions: [{ id: "stop", label: "Stop", method: "POST", path: "/stop", body: "hashes=all" }],
    });
    mockRequest.mockResolvedValue({});

    await runAction(INSTANCE, "stop");

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/stop",
      expect.objectContaining({
        body: "hashes=all",
        headers: expect.objectContaining({ "Content-Type": "application/x-www-form-urlencoded" }),
      }),
    );
  });

  it("infers application/json for a JSON-shaped action body", async () => {
    setStore({
      actions: [{ id: "restart", label: "Restart", method: "POST", path: "/restart", body: '{"a":1}' }],
    });
    mockRequest.mockResolvedValue({});

    await runAction(INSTANCE, "restart");

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/restart",
      expect.objectContaining({
        body: '{"a":1}',
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("sends no Content-Type when the action has no body", async () => {
    setStore({ actions: [{ id: "ping", label: "Ping", method: "POST", path: "/ping" }] });
    mockRequest.mockResolvedValue({});

    await runAction(INSTANCE, "ping");

    const headers = mockRequest.mock.calls[0]![2].headers as Record<string, string>;
    expect("Content-Type" in headers).toBe(false);
  });

  it("infers form-urlencoded for a non-JSON health body", async () => {
    setStore({ health: { method: "POST", path: "/status", body: "hashes=all" } });
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/x-www-form-urlencoded" }),
      }),
    );
  });

  it("infers application/json for a JSON-shaped health body", async () => {
    setStore({ health: { method: "POST", path: "/status", body: '{"a":1}' } });
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("sends no Content-Type when the health check has no body", async () => {
    setStore({ health: { method: "GET", path: "/status" } });
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    const headers = mockRequest.mock.calls[0]![2].headers as Record<string, string>;
    expect("Content-Type" in headers).toBe(false);
  });

  it("infers form-urlencoded for a non-JSON stats source body", async () => {
    setStore({
      health: { method: "POST", path: "/status", body: "hashes=all" },
      stats: [{ label: "Count", path: "count" }],
    });
    mockRequest.mockResolvedValue({ count: 3 });

    await getStats(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/x-www-form-urlencoded" }),
      }),
    );
  });

  // The login step keeps its own explicit contentType, unaffected by
  // inference — never overridden by this rule.
  it("leaves the login body's explicit contentType unchanged", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        contentType: "application/json",
        // Deliberately NOT JSON-shaped, to prove inference is not applied here.
        body: "hashes=all",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Token",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "tok" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    const [, fetchInit] = mockFetch().mock.calls[0];
    expect(fetchInit.headers["Content-Type"]).toBe("application/json");
  });
});

describe("login capture", () => {
  it("substitutes {{username}}/{{password}} from auth even when auth.mode is 'none'", async () => {
    setStore({
      auth: { mode: "none", username: "bob", password: "secret" },
      login: {
        method: "POST",
        path: "/login",
        contentType: "application/json",
        body: '{"u":"{{username}}","p":"{{password}}"}',
        captureJSONPath: "sid",
        injectAs: "cookie",
        injectName: "SID",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { sid: "s1" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    const [, fetchInit] = mockFetch().mock.calls[0];
    expect(fetchInit.body).toBe('{"u":"bob","p":"secret"}');
  });

  it("captures from a JSON path and injects it as a header on the real request", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Session-Token",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "abc123" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockFetch()).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Session-Token": "abc123" }) }),
    );
  });

  it("captures from Set-Cookie when no JSON path is configured", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureCookie: "SESSIONID",
        injectAs: "cookie",
        injectName: "SESSIONID",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "SESSIONID=xyz789; Path=/; HttpOnly" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "SESSIONID=xyz789" }) }),
    );
  });

  // Live-proof: qBittorrent 5.2.3 sets its session cookie as `QBT_SID_8080`
  // (port-suffixed) — a fixed `captureCookie: "SID"` never matches it.
  it("captures the real cookie name through a * wildcard and injects it when injectName is empty", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureCookie: "*SID*",
        injectAs: "cookie",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "QBT_SID_8080=abc; HttpOnly" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "QBT_SID_8080=abc" }) }),
    );
  });

  it("sends no cookie when the captureCookie pattern matches nothing", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureCookie: "*NOPE*",
        injectAs: "cookie",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "QBT_SID_8080=abc; HttpOnly" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Cookie: expect.anything() }),
      }),
    );
  });

  it("treats special regex characters in captureCookie literally, never as a raw regex", async () => {
    setStore({
      // As a raw regex /SID.ID/ (`.` = any char) this would match "SIDXID"
      // too — it must not once the pattern is escaped.
      login: { method: "POST", path: "/login", captureCookie: "SID.ID", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ setCookie: "SIDXID=wrong; HttpOnly" }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Cookie: expect.anything() }),
      }),
    );
  });

  // The fetch polyfill this app runs under joins MULTIPLE Set-Cookie response
  // headers with ", " into one string — there is no way to read them
  // separately from JS. A pattern must still find the right cookie's name
  // among the comma-joined pieces, not accidentally swallow a neighboring
  // cookie or its attributes into the captured name/value.
  it("finds the right cookie among multiple comma-joined Set-Cookie headers", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "*SID*", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "other=1; Path=/, QBT_SID_8080=abc; HttpOnly" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "QBT_SID_8080=abc" }) }),
    );
  });

  it("matches the right cookie among comma-joined headers with a prefix wildcard", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "QBT_SID_*", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "csrf=t; Path=/, QBT_SID_8080=abc" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "QBT_SID_8080=abc" }) }),
    );
  });

  it("picks the first matching cookie in header order when more than one candidate matches", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "*SID*", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({ setCookie: "SID=first; Path=/, QBT_SID_8080=second" }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "SID=first" }) }),
    );
  });

  it("matches qBittorrent's real Set-Cookie header shape (attributes, comma-bearing expires)", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "*SID*", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(
      mockLoginResponse({
        setCookie:
          "QBT_SID_8080=abc; HttpOnly; SameSite=Lax; expires=Tue, 08-Sep-2026 18:21:35 GMT; path=/",
      }),
    );
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "QBT_SID_8080=abc" }) }),
    );
  });

  it("still matches an exact (non-wildcard) captureCookie name unchanged", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "SID", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ setCookie: "SID=exactvalue; Path=/" }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: "SID=exactvalue" }) }),
    );
  });

  // ReDoS regression: the previous RegExp-based matcher (`.*?`-per-`*`
  // compiled against the raw header) took >10s on node 22 for a many-star
  // pattern against a long run of a repeated character. `pattern` is
  // user-typed and the header is server-controlled, so both sides of the
  // match are untrusted — this must stay linear-time with no RegExp built
  // from either.
  it("resolves a pathological captureCookie pattern against a long header without ReDoS", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureCookie: "*a*a*a*a*a*", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ setCookie: "a".repeat(5000) }));
    mockRequest.mockResolvedValue({});

    const start = Date.now();
    await checkHealth(INSTANCE);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it("treats a cookie-injectAs login with no readable Set-Cookie as authenticated via the platform jar", async () => {
    setStore({
      login: { method: "POST", path: "/login", injectAs: "cookie" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({}));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Cookie: expect.anything() }),
      }),
    );
  });

  it("reuses the cached capture across calls instead of logging in again", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Token",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "tok" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);
    await checkHealth(INSTANCE);

    expect(mockFetch()).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("on a 401, invalidates the cached capture and retries exactly once with a fresh login", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Token",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch()
      .mockResolvedValueOnce(mockLoginResponse({ jsonBody: { token: "old-token" } }))
      .mockResolvedValueOnce(mockLoginResponse({ jsonBody: { token: "new-token" } }));
    mockRequest
      .mockRejectedValueOnce(new HttpError(401, "Unauthorized", "url"))
      .mockResolvedValueOnce({ ok: true });

    const result = await checkHealth(INSTANCE);

    expect(mockFetch()).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1]![2]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ "X-Token": "new-token" }) }),
    );
    expect(result.status).toBe("ok");
  });

  it("does not retry a 401 when no login step is configured", async () => {
    setStore({ health: { method: "GET", path: "/status" } });
    mockRequest.mockRejectedValue(new HttpError(401, "Unauthorized", "url"));

    const result = await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("offline");
  });

  it("throws when the login response fails and captured nothing", async () => {
    setStore({
      login: { method: "POST", path: "/login", captureJSONPath: "token", injectAs: "header", injectName: "X-Token" },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ ok: false, status: 403, jsonBody: {} }));

    const result = await checkHealth(INSTANCE);
    expect(result.status).toBe("offline");
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("performLogin — merged custom headers", () => {
  it("applies the instance's merged custom headers to the login request, skipping any Cookie, with definition headers winning on collision", async () => {
    setStore(
      {
        auth: { mode: "header", headerName: "Authorization", token: "def-token" },
        login: {
          method: "POST",
          path: "/login",
          captureJSONPath: "token",
          injectAs: "header",
          injectName: "X-Token",
        },
        health: { method: "GET", path: "/status" },
      },
      "http://custom.local",
      {
        "X-Proxy-Auth": "proxy-secret",
        Authorization: "Bearer should-not-win",
        Cookie: "leftover=1",
      },
    );
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "tok" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    const [, fetchInit] = mockFetch().mock.calls[0];
    expect(fetchInit.headers["X-Proxy-Auth"]).toBe("proxy-secret");
    expect(fetchInit.headers["Authorization"]).toBe("def-token");
    expect(fetchInit.headers["Cookie"]).toBeUndefined();
  });
});

describe("timeout", () => {
  it("passes def.timeoutSeconds through to serviceRequest as timeout (ms) for health/stats/actions", async () => {
    setStore({ health: { method: "GET", path: "/status" }, timeoutSeconds: 5 });
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest).toHaveBeenCalledWith(
      "custom",
      "/status",
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("leaves timeout unset (serviceRequest's own default) when timeoutSeconds is unconfigured", async () => {
    setStore({ health: { method: "GET", path: "/status" } });
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    expect(mockRequest.mock.calls[0]![2].timeout).toBeUndefined();
  });

  it("wires an AbortController on the login fetch honoring def.timeoutSeconds", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Token",
      },
      health: { method: "GET", path: "/status" },
      timeoutSeconds: 3,
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "tok" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);

    const [, fetchInit] = mockFetch().mock.calls[0];
    expect(fetchInit.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("clearCustomServiceCache", () => {
  it("forces a fresh login on the next request instead of reusing the cached capture", async () => {
    setStore({
      login: {
        method: "POST",
        path: "/login",
        captureJSONPath: "token",
        injectAs: "header",
        injectName: "X-Token",
      },
      health: { method: "GET", path: "/status" },
    });
    mockFetch().mockResolvedValue(mockLoginResponse({ jsonBody: { token: "tok" } }));
    mockRequest.mockResolvedValue({});

    await checkHealth(INSTANCE);
    expect(mockFetch()).toHaveBeenCalledTimes(1);

    clearCustomServiceCache(INSTANCE);

    await checkHealth(INSTANCE);
    expect(mockFetch()).toHaveBeenCalledTimes(2);
  });
});
