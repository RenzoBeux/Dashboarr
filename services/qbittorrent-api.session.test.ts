// A restore that reuses a qBittorrent id must not let a login still in flight
// for the previous settings hand its session to the new ones.
const mockKeychain = new Map<string, string>();
const mockPlatform = { OS: "android" };
const mockConfig = { url: "http://old.local", username: "admin" };

jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatform.OS;
    },
  },
}));
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
      instanceSecrets: { "qb-1": { username: mockConfig.username, password: "secret" } },
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

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("qBittorrent session after a restore", () => {
  const originalFetch = global.fetch;
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("never sends either server's SID to the other", async () => {
    mockPlatform.OS = "android";
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
    await flush();
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

  it("keeps a late login for the previous account on the same host from replacing the new one", async () => {
    mockPlatform.OS = "ios";
    mockConfig.url = "http://qb.local";
    mockConfig.username = "old-user";
    resetInstanceSessions(["qb-1"]);
    // iOS strips Set-Cookie: the platform jar takes the SID as the response
    // arrives and attaches it to every later request to that host. A request
    // once sent runs to the end: React Native cannot always cancel it.
    const jar = new Map<string, string>();
    const logins: string[] = [];
    const sidsUsed: (string | undefined)[] = [];
    let finishOldLogin!: () => void;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const { host } = new URL(url);
      if (!url.endsWith("/auth/login")) {
        sidsUsed.push(jar.get(host));
        return response(200, "0");
      }
      const user = new URLSearchParams(String(init?.body)).get("username") ?? "";
      logins.push(user);
      const land = () => {
        jar.set(host, `${user}-sid`);
        return response(200, "Ok.");
      };
      if (user !== "old-user") return land();
      return new Promise((resolve) => {
        finishOldLogin = () => resolve(land());
      });
    }) as unknown as typeof fetch;

    const oldRequest = getSpeedLimitsMode("qb-1");
    await flush();
    // The restore keeps the host and switches the account.
    mockConfig.username = "new-user";
    resetInstanceSessions(["qb-1"]);
    const newRequest = getSpeedLimitsMode("qb-1");
    await flush();
    // The old login could still land after a new one, so none goes out yet.
    expect(logins).toEqual(["old-user"]);
    finishOldLogin();
    await newRequest;
    await getSpeedLimitsMode("qb-1");
    await expect(oldRequest).rejects.toThrow();
    expect(logins[1]).toBe("new-user");
    expect(sidsUsed).toEqual(["new-user-sid", "new-user-sid"]);
  });
});
