// A restore that reuses a qBittorrent id must not let a login still in flight
// for the old server hand its SID to the new one.
const mockKeychain = new Map<string, string>();
const mockConfig = { url: "http://old.local" };

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("@/lib/http-client", () => ({
  buildUrl: jest.requireActual("@/lib/url-builder").buildUrl,
  resolveReachableUrl: () => mockConfig.url,
}));
jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => ({
      demoMode: false,
      getActiveInstanceId: () => "qb-1",
      getInstance: () => ({ id: "qb-1", enabled: true }),
      getMergedHeaders: () => ({}),
      instanceSecrets: { "qb-1": { username: "admin", password: "secret" } },
    }),
  },
}));
jest.mock("@/store/storage", () => ({
  getSecret: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setSecret: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteSecret: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

import { getSpeedLimitsMode } from "@/services/qbittorrent-api";
import { resetInstanceSessions } from "@/lib/session-registry";

function response(status: number, body: string, setCookie?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "set-cookie") return setCookie ?? null;
        if (name.toLowerCase() === "content-type") return "text/plain";
        return null;
      },
    },
    text: async () => body,
  };
}

describe("qBittorrent session after a restore", () => {
  const originalFetch = global.fetch;
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("never sends either server's SID to the other", async () => {
    let finishOldLogin!: () => void;
    const sent: { url: string; cookie: string | null }[] = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get("Cookie");
      sent.push({ url, cookie });
      if (url.endsWith("/auth/login")) {
        if (url.startsWith("http://old.local")) {
          return new Promise((resolve) => {
            finishOldLogin = () => resolve(response(200, "Ok.", "SID=old-sid; HttpOnly"));
          });
        }
        return response(200, "Ok.", "SID=new-sid; HttpOnly");
      }
      return response(200, "0");
    }) as unknown as typeof fetch;

    const oldRequest = getSpeedLimitsMode("qb-1");
    await new Promise((resolve) => setImmediate(resolve));
    // The restore commits: new settings for the same id, sessions reset.
    mockConfig.url = "http://new.local";
    resetInstanceSessions(["qb-1"]);
    finishOldLogin();
    // Its URL and headers are the old server's, so it must not go out at all.
    await expect(oldRequest).rejects.toThrow();

    await expect(getSpeedLimitsMode("qb-1")).resolves.toBe(false);
    const toNewServer = sent.filter(({ url }) => url.startsWith("http://new.local"));
    expect(toNewServer.length).toBeGreaterThan(0);
    expect(toNewServer.map(({ cookie }) => cookie)).not.toContain("SID=old-sid");
    expect(toNewServer.at(-1)?.cookie).toBe("SID=new-sid");
    const toOldServer = sent.filter(({ url }) => url.startsWith("http://old.local"));
    expect(toOldServer.map(({ url }) => url)).toEqual(["http://old.local/api/v2/auth/login"]);
    expect(mockKeychain.get("secrets.qb-1.sessionCookie")).toBe("new-sid");
  });
});
