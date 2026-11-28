jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: jest.fn() },
}));

import { useConfigStore } from "@/store/config-store";
import { resetBeszelSessions } from "@/lib/beszel-session";
import {
  BeszelAuthError,
  beszelUserToken,
  beszelClearSession,
  beszelLogin,
  getContainerStats,
  getContainers,
  getSystemStats,
  getSystems,
} from "@/services/beszel-api";

const mockGetState = useConfigStore.getState as jest.Mock;

const INSTANCE = "inst-1";
const BASE_URL = "http://beszel.local:8090";

function setStore(overrides: Record<string, unknown> = {}) {
  mockGetState.mockReturnValue({
    demoMode: false,
    getActiveInstanceId: () => INSTANCE,
    instanceSecrets: { [INSTANCE]: { username: "admin", password: "hunter2" } },
    getActiveUrl: () => BASE_URL,
    // resolveReachableUrl reads the instance for the reachability guards.
    getInstance: () => ({
      id: INSTANCE,
      enabled: true,
      name: "Beszel",
      localUrl: BASE_URL,
      remoteUrl: "",
      useRemote: false,
    }),
    getMergedHeaders: () => ({}),
    ...overrides,
  });
}

type FetchCall = { url: string; init: RequestInit };

function fetchMock(handler: (call: FetchCall) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const fn = jest.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(handler({ url, init }));
  });
  global.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function page<T>(items: T[]) {
  return { page: 1, perPage: items.length || 1, totalItems: items.length, totalPages: 1, items };
}

beforeEach(() => {
  resetBeszelSessions();
  mockGetState.mockReset();
  setStore();
});

describe("beszelLogin", () => {
  it("tries _superusers first and returns its token on success", async () => {
    const { calls } = fetchMock(() => jsonResponse(200, { token: "tok-super" }));
    await expect(beszelLogin(INSTANCE)).resolves.toEqual({
      token: "tok-super",
      authCollection: "_superusers",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/api/collections/_superusers/auth-with-password");
  });

  it("falls back to users on a 400 from _superusers", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("_superusers")) {
        return jsonResponse(400, { message: "Failed to authenticate." });
      }
      return jsonResponse(200, { token: "tok-user" });
    });
    await expect(beszelLogin(INSTANCE)).resolves.toEqual({
      token: "tok-user",
      authCollection: "users",
    });
    expect(calls).toHaveLength(2);
  });

  it("throws BeszelAuthError when both collections reject the credentials", async () => {
    fetchMock(() => jsonResponse(400, { message: "Failed to authenticate." }));
    await expect(beszelLogin(INSTANCE)).rejects.toThrow(BeszelAuthError);
  });

  it("throws on a non-400 non-ok response from _superusers without trying users", async () => {
    const { calls } = fetchMock(() => jsonResponse(500, {}));
    await expect(beszelLogin(INSTANCE)).rejects.toThrow("Beszel request failed: 500");
    expect(calls).toHaveLength(1);
  });
});

describe("beszelUserToken", () => {
  it("authenticates against users only, even when a superuser would succeed", async () => {
    const { calls } = fetchMock(() => jsonResponse(200, { token: "tok-user" }));
    await expect(beszelUserToken(INSTANCE)).resolves.toBe("tok-user");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/api/collections/users/auth-with-password");
  });

  it("throws BeszelAuthError when users rejects the credentials", async () => {
    fetchMock(() => jsonResponse(400, { message: "Failed to authenticate." }));
    await expect(beszelUserToken(INSTANCE)).rejects.toThrow(BeszelAuthError);
  });
});

describe("getSystems / retry backstop", () => {
  it("logs in once and returns systems on a cold cache", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      return jsonResponse(200, page([{ id: "sys-1" }]));
    });
    await expect(getSystems(INSTANCE)).resolves.toEqual([{ id: "sys-1" }]);
    expect(calls).toHaveLength(2); // login + list, no auth-refresh needed
  });

  it("does not call auth-refresh when a freshly-logged-in token returns empty", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      return jsonResponse(200, page([]));
    });
    await expect(getSystems(INSTANCE)).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.url.includes("auth-refresh"))).toBe(false);
  });

  it("confirms a cache-hit empty result via auth-refresh and trusts it when still valid", async () => {
    let listCalls = 0;
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      if (url.includes("auth-refresh")) return jsonResponse(200, { token: "tok-1-renewed" });
      listCalls += 1;
      return jsonResponse(200, page([]));
    });

    // First call logs in fresh and gets an empty (trusted) result.
    await getSystems(INSTANCE);
    // Second call reuses the cached token (not fresh) and gets empty again —
    // this time it must be confirmed via auth-refresh rather than assumed.
    await expect(getSystems(INSTANCE)).resolves.toEqual([]);

    expect(listCalls).toBe(2);
    const refreshCalls = calls.filter((c) => c.url.includes("auth-refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.url).toContain("/api/collections/_superusers/auth-refresh");
    // No second login was triggered — the token was confirmed valid.
    const loginCalls = calls.filter((c) => c.url.includes("auth-with-password"));
    expect(loginCalls).toHaveLength(1);
  });

  it("keeps the empty result when the auth-refresh confirmation itself fails", async () => {
    // The list GET succeeded; only the secondary confirmation call broke. A
    // transient 5xx there must not turn a good (empty) response into an error,
    // and must not trigger a re-login either — the next poll confirms again.
    let listCalls = 0;
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      if (url.includes("auth-refresh")) return jsonResponse(503, { message: "temporarily down" });
      listCalls += 1;
      return jsonResponse(200, page([]));
    });

    await getSystems(INSTANCE);
    await expect(getSystems(INSTANCE)).resolves.toEqual([]);

    expect(listCalls).toBe(2);
    expect(calls.filter((c) => c.url.includes("auth-refresh"))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("auth-with-password"))).toHaveLength(1);
  });

  it("keeps the empty result when the auth-refresh confirmation cannot connect", async () => {
    let listCalls = 0;
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes("auth-with-password")) {
        return Promise.resolve(jsonResponse(200, { token: "tok-1" }));
      }
      if (String(url).includes("auth-refresh")) {
        return Promise.reject(new TypeError("Network request failed"));
      }
      listCalls += 1;
      return Promise.resolve(jsonResponse(200, page([])));
    }) as unknown as typeof fetch;

    await getSystems(INSTANCE);
    await expect(getSystems(INSTANCE)).resolves.toEqual([]);
    expect(listCalls).toBe(2);
  });

  it("drops the session and retries with a fresh login when auth-refresh says the token is invalid", async () => {
    let loginCount = 0;
    let listCount = 0;
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) {
        loginCount += 1;
        return jsonResponse(200, { token: `tok-${loginCount}` });
      }
      if (url.includes("auth-refresh")) return jsonResponse(404, {});
      listCount += 1;
      // First call's fresh-login list (call 1) and second call's stale-cache
      // list (call 2) are both empty; only the retry after re-login (call 3,
      // a fresh token) returns real data.
      return listCount <= 2 ? jsonResponse(200, page([])) : jsonResponse(200, page([{ id: "sys-1" }]));
    });

    await getSystems(INSTANCE); // cold cache: fresh login, empty result trusted
    await expect(getSystems(INSTANCE)).resolves.toEqual([{ id: "sys-1" }]);

    expect(loginCount).toBe(2);
    expect(listCount).toBe(3); // first call's list + second call's stale list + retry list
    expect(calls.filter((c) => c.url.includes("auth-refresh"))).toHaveLength(1);
  });
});

describe("getSystemStats / getContainers filters", () => {
  it("asks for the rollup type created inside the window, newest first", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      return jsonResponse(200, page([]));
    });
    await getSystemStats("sys-1", "10m", "2026-11-28 09:00:00", INSTANCE);
    const listCall = calls.find((c) => c.url.includes("system_stats"));
    const params = new URL(listCall!.url).searchParams;
    expect(params.get("filter")).toBe("system='sys-1'&&type='10m'&&created>='2026-11-28 09:00:00'");
    expect(params.get("sort")).toBe("-created");
    expect(params.get("perPage")).toBe("500");
  });

  it("queries container_stats with the same window filter", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      return jsonResponse(200, page([]));
    });
    await getContainerStats("sys-1", "120m", "2026-11-21 10:00:00", INSTANCE);
    const listCall = calls.find((c) => c.url.includes("/collections/container_stats/records"));
    const params = new URL(listCall!.url).searchParams;
    expect(params.get("filter")).toBe("system='sys-1'&&type='120m'&&created>='2026-11-21 10:00:00'");
    expect(params.get("perPage")).toBe("500");
  });

  it("sends the system filter for containers", async () => {
    const { calls } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) return jsonResponse(200, { token: "tok-1" });
      return jsonResponse(200, page([]));
    });
    await getContainers("sys-1", INSTANCE);
    const listCall = calls.find((c) => c.url.includes("containers"));
    expect(listCall!.url).toContain("filter=system%3D'sys-1'");
  });
});

describe("demo mode", () => {
  it("short-circuits before any login handshake", async () => {
    setStore({ demoMode: true });
    const { fn } = fetchMock(() => jsonResponse(200, {}));
    await getSystems(INSTANCE);
    expect(fn).not.toHaveBeenCalled();
  });
  it("serves stats spaced by the requested rollup, for every chart", async () => {
    setStore({ demoMode: true });
    fetchMock(() => jsonResponse(200, {}));
    const stats = await getSystemStats("demo-beszel-sys-a", "480m", "2026-01-01 00:00:00", INSTANCE);
    expect(stats.length).toBeGreaterThan(10);
    expect(stats.every((r) => r.type === "480m")).toBe(true);
    const spanMs = Date.parse(stats[0].created) - Date.parse(stats[stats.length - 1].created);
    expect(spanMs).toBeGreaterThan(7 * 86_400_000);
    const s = stats[0].stats;
    expect(s.mem && s.dio && s.b && s.t && s.g && s.swap).toBeTruthy();
  });

  it("serves container stats for the requested system only", async () => {
    setStore({ demoMode: true });
    fetchMock(() => jsonResponse(200, {}));
    const stats = await getContainerStats("demo-beszel-sys-a", "1m", "2026-01-01 00:00:00", INSTANCE);
    expect(stats.length).toBeGreaterThan(10);
    expect(stats[0].system).toBe("demo-beszel-sys-a");
    expect(stats[0].stats.length).toBeGreaterThan(0);
  });

});

describe("beszelClearSession", () => {
  it("drops a cached instance's token even after it's gone from config", async () => {
    let loginCount = 0;
    const { fn } = fetchMock(({ url }) => {
      if (url.includes("auth-with-password")) {
        loginCount += 1;
        return jsonResponse(200, { token: `tok-${loginCount}` });
      }
      return jsonResponse(200, page([{ id: "sys-1" }]));
    });
    await getSystems(INSTANCE);
    expect(loginCount).toBe(1);

    // beszelClearSession is only ever called with the instance's own id
    // (never bulk), and by the time performDelete calls it the instance is
    // typically already gone from serviceInstances — it must find and drop
    // the cached token via the session map itself, not by looking the
    // instance up in config.
    beszelClearSession(INSTANCE);

    await getSystems(INSTANCE);
    expect(loginCount).toBe(2);
    expect(fn.mock.calls.filter(([url]) => String(url).includes("auth-with-password"))).toHaveLength(2);
  });
});
