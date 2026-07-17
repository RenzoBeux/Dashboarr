import {
  serviceRequest,
  pingService,
  testServiceConnection,
  AuthProxyResponseError,
  HttpError,
  isAbortError,
} from "./http-client";

// jest.mock factories run before module-scope code; the only refs allowed
// inside are auto-imports + names prefixed with `mock`.
const mockStateRef: { current: any } = { current: null };

jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => mockStateRef.current,
  },
}));

interface FakeInstance {
  id: string;
  enabled: boolean;
  name: string;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
}

interface FakeSecrets {
  apiKey?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

// Mock the v13 multi-instance store shape. Each service kind owns an array of
// instances; secrets and the active-instance pointer are keyed by instance UUID.
// Convenience aliases (`secrets[serviceId]`) point at the active instance's
// secret bag so each test can write `mockStateRef.current.secrets.radarr.X`
// without having to know the synthetic UUID.
interface FakeState {
  demoMode: boolean;
  // Off-WiFi LAN guard inputs (#106/#185). Absent in most tests → undefined →
  // the guard never trips, same as the cold-start `null` in the real store.
  isOnWifi?: boolean | null;
  isVpnActive?: boolean;
  // Opt-in that lets a VPN stand the guard down (#185). Falsy by default, so an
  // untrusted VPN does NOT make a private URL reachable off Wi-Fi.
  treatVpnAsHome?: boolean;
  serviceInstances: Record<string, FakeInstance[]>;
  instanceSecrets: Record<string, FakeSecrets>;
  activeInstance: Record<string, string | null>;
  // Active-instance projections kept in sync with the underlying maps.
  secrets: Record<string, FakeSecrets>;
  globalCustomHeaders: Record<string, string>;
  getActiveInstanceId: (id: string) => string | null;
  getInstance: (id: string, instanceId: string) => FakeInstance | undefined;
  getActiveUrl: (id: string, instanceId?: string) => string;
  getMergedHeaders: (id: string, instanceId?: string) => Record<string, string>;
}

const FIXTURE_KINDS = [
  { id: "radarr", url: "http://radarr.local:7878", secrets: { apiKey: "radarr-key" } },
  { id: "sonarr", url: "http://sonarr.local:8989", secrets: { apiKey: "sonarr-key" } },
  { id: "plex", url: "http://plex.local:32400", secrets: { apiKey: "plex-token" } },
  { id: "jellyfin", url: "http://jelly.local:8096", secrets: { apiKey: "jelly-token" } },
  { id: "emby", url: "http://emby.local:8096", secrets: { apiKey: "emby-token" } },
  { id: "glances", url: "http://glances.local:61208", secrets: { username: "u", password: "p" } },
  { id: "rtorrent", url: "http://seedbox.local/RPC2", secrets: { username: "u", password: "p" } },
];

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  const serviceInstances: Record<string, FakeInstance[]> = {};
  const instanceSecrets: Record<string, FakeSecrets> = {};
  const activeInstance: Record<string, string | null> = {};
  const secrets: Record<string, FakeSecrets> = {};

  for (const f of FIXTURE_KINDS) {
    const uuid = `${f.id}-uuid`;
    serviceInstances[f.id] = [
      {
        id: uuid,
        enabled: true,
        name: f.id,
        localUrl: f.url,
        remoteUrl: "",
        useRemote: false,
      },
    ];
    instanceSecrets[uuid] = { ...f.secrets };
    activeInstance[f.id] = uuid;
    secrets[f.id] = instanceSecrets[uuid];
  }

  const state: FakeState = {
    demoMode: false,
    serviceInstances,
    instanceSecrets,
    activeInstance,
    secrets,
    globalCustomHeaders: {},
    getActiveInstanceId(id) {
      return this.activeInstance[id] ?? this.serviceInstances[id]?.[0]?.id ?? null;
    },
    getInstance(id, instanceId) {
      return this.serviceInstances[id]?.find((i) => i.id === instanceId);
    },
    getActiveUrl(id, instanceId) {
      const list = this.serviceInstances[id] ?? [];
      const targetId = instanceId ?? this.activeInstance[id] ?? list[0]?.id;
      const inst = list.find((i) => i.id === targetId);
      if (!inst) return "";
      return inst.useRemote ? inst.remoteUrl : inst.localUrl;
    },
    getMergedHeaders(id, instanceId) {
      const targetId =
        instanceId ?? this.activeInstance[id] ?? this.serviceInstances[id]?.[0]?.id;
      const perInstance = targetId
        ? this.instanceSecrets[targetId]?.customHeaders
        : undefined;
      return { ...this.globalCustomHeaders, ...(perInstance ?? {}) };
    },
    ...overrides,
  };
  return state;
}

function fetchMock(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({}),
    text: async () => "",
    clone() {
      return this;
    },
  });
}

describe("serviceRequest — custom header injection", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = fetchMock();
    global.fetch = fetchSpy as any;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function getSentHeaders(): Headers {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as { headers: Headers };
    return init.headers;
  }

  it("attaches a per-service custom header on a Radarr request", async () => {
    mockStateRef.current.secrets.radarr.customHeaders = {
      "CF-Access-Client-Id": "id-1",
    };
    await serviceRequest("radarr", "/system/status");
    expect(getSentHeaders().get("CF-Access-Client-Id")).toBe("id-1");
  });

  it("attaches global custom headers on a service that has none of its own", async () => {
    mockStateRef.current.globalCustomHeaders = {
      "CF-Access-Client-Id": "g-id",
      "CF-Access-Client-Secret": "g-secret",
    };
    await serviceRequest("sonarr", "/system/status");
    const headers = getSentHeaders();
    expect(headers.get("CF-Access-Client-Id")).toBe("g-id");
    expect(headers.get("CF-Access-Client-Secret")).toBe("g-secret");
  });

  it("merges global + per-service with per-service winning on collision", async () => {
    mockStateRef.current.globalCustomHeaders = {
      "X-Shared": "global-value",
      Authorization: "Bearer global",
    };
    mockStateRef.current.secrets.radarr.customHeaders = {
      Authorization: "Bearer service",
    };
    await serviceRequest("radarr", "/system/status");
    const headers = getSentHeaders();
    expect(headers.get("X-Shared")).toBe("global-value");
    expect(headers.get("Authorization")).toBe("Bearer service");
  });

  it("never lets a custom header overwrite the service's X-Api-Key", async () => {
    mockStateRef.current.secrets.radarr.customHeaders = {
      "X-Api-Key": "user-typed-this-by-mistake",
    };
    await serviceRequest("radarr", "/system/status");
    expect(getSentHeaders().get("X-Api-Key")).toBe("radarr-key");
  });

  it("never lets a custom header overwrite the Plex token", async () => {
    mockStateRef.current.secrets.plex.customHeaders = {
      "X-Plex-Token": "spoofed",
    };
    await serviceRequest("plex", "/identity");
    expect(getSentHeaders().get("X-Plex-Token")).toBe("plex-token");
  });

  it("never lets a custom header overwrite the Jellyfin token", async () => {
    mockStateRef.current.secrets.jellyfin.customHeaders = {
      "X-Emby-Token": "spoofed",
    };
    await serviceRequest("jellyfin", "/System/Info/Public");
    expect(getSentHeaders().get("X-Emby-Token")).toBe("jelly-token");
  });

  it("authenticates Emby with X-Emby-Token (same scheme as Jellyfin)", async () => {
    mockStateRef.current.secrets.emby.customHeaders = {
      "X-Emby-Token": "spoofed",
    };
    await serviceRequest("emby", "/System/Info/Public");
    expect(getSentHeaders().get("X-Emby-Token")).toBe("emby-token");
  });

  it("never lets a custom header overwrite Basic auth on Glances", async () => {
    mockStateRef.current.secrets.glances.customHeaders = {
      Authorization: "Bearer attacker",
    };
    await serviceRequest("glances", "/cpu");
    const auth = getSentHeaders().get("Authorization");
    expect(auth?.startsWith("Basic ")).toBe(true);
  });
});

describe("pingService — custom header injection", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    global.fetch = fetchSpy as any;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards merged headers on the ping (so the proxy lets it through)", async () => {
    mockStateRef.current.globalCustomHeaders = { "CF-Access-Client-Id": "g" };
    mockStateRef.current.secrets.radarr.customHeaders = {
      "X-Override": "svc",
    };
    await pingService("radarr");
    const init = fetchSpy.mock.calls[0][1] as { headers: Headers };
    expect(init.headers.get("CF-Access-Client-Id")).toBe("g");
    expect(init.headers.get("X-Override")).toBe("svc");
    // Service auth still wins on the ping path too.
    expect(init.headers.get("X-Api-Key")).toBe("radarr-key");
  });
});

// The fixtures use .local (mDNS) URLs, which isPrivateUrl flags — exactly the
// shape the guard exists for.
describe("off-WiFi LAN guard — VPN awareness (#185)", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = fetchMock();
    global.fetch = fetchSpy as any;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("short-circuits a private URL off WiFi with no VPN (the #106 behavior)", async () => {
    mockStateRef.current.isOnWifi = false;
    mockStateRef.current.isVpnActive = false;
    await expect(serviceRequest("radarr", "/system/status")).rejects.toThrow(
      "private LAN address not reachable off Wi-Fi",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pingService("radarr")).toBeNull();
  });

  it("attempts a private URL off WiFi while a trusted VPN is up (the tunnel can route it)", async () => {
    mockStateRef.current.isOnWifi = false;
    mockStateRef.current.isVpnActive = true;
    mockStateRef.current.treatVpnAsHome = true;
    await serviceRequest("radarr", "/system/status");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still blocks a private URL off WiFi when a VPN is up but not opted-in (#185)", async () => {
    // Bug: without this, ANY VPN — even one to a hostile network the user never
    // chose to trust — would silently make the LAN URL "work" off Wi-Fi.
    mockStateRef.current.isOnWifi = false;
    mockStateRef.current.isVpnActive = true;
    mockStateRef.current.treatVpnAsHome = false;
    await expect(serviceRequest("radarr", "/system/status")).rejects.toThrow(
      "private LAN address not reachable off Wi-Fi",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pingService("radarr")).toBeNull();
  });

  it("blocks a private URL even in the remote slot with useRemote forced (no VPN)", async () => {
    // The reporter's workaround attempt in #185: LAN address in the Remote URL
    // field + "Always use Remote URL". The guard keys on the URL's host, not
    // the slot, so without a VPN it still trips.
    const inst = mockStateRef.current.serviceInstances.radarr[0];
    inst.remoteUrl = "http://192.168.1.50:7878";
    inst.useRemote = true;
    mockStateRef.current.isOnWifi = false;
    mockStateRef.current.isVpnActive = false;
    await expect(serviceRequest("radarr", "/system/status")).rejects.toThrow(
      "private LAN address not reachable off Wi-Fi",
    );

    mockStateRef.current.isVpnActive = true;
    mockStateRef.current.treatVpnAsHome = true;
    await serviceRequest("radarr", "/system/status");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never short-circuits while WiFi state is still unknown (cold start)", async () => {
    mockStateRef.current.isOnWifi = null;
    mockStateRef.current.isVpnActive = false;
    await serviceRequest("radarr", "/system/status");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// An auth proxy (Authentik/Authelia/…) in front of a service answers the app's
// API-key-only requests with its own HTML login page. serviceRequest must throw
// an actionable error instead of returning the HTML string, which would crash
// downstream array methods with "undefined is not a function" (#239).
describe("serviceRequest — auth-proxy HTML detection (#239)", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = fetchMock();
    global.fetch = fetchSpy as any;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

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

  it("throws AuthProxyResponseError on a 2xx text/html login page", async () => {
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<!DOCTYPE html><html><body>Sign in</body></html>",
      }),
    );
    await expect(serviceRequest("radarr", "/movie")).rejects.toBeInstanceOf(
      AuthProxyResponseError,
    );
  });

  it("sniffs the body when the content-type is missing or wrong", async () => {
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers(),
        text: async () =>
          '  <html lang="en"><head><title>authentik</title></head></html>',
      }),
    );
    await expect(serviceRequest("radarr", "/movie")).rejects.toThrow(
      /authentication proxy/i,
    );
  });

  it("treats an HTML body on a 401 as an auth proxy too", async () => {
    fetchSpy.mockResolvedValueOnce(
      respond({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers({ "content-type": "text/html" }),
        json: async () => {
          throw new Error("not json");
        },
        text: async () => "<html>login</html>",
      }),
    );
    await expect(serviceRequest("sonarr", "/series")).rejects.toBeInstanceOf(
      AuthProxyResponseError,
    );
  });

  it("still returns rtorrent's XML-RPC string (not mistaken for HTML)", async () => {
    const xml =
      '<?xml version="1.0"?><methodResponse><params><param><value><array><data></data></array></value></param></params></methodResponse>';
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "text/xml" }),
        text: async () => xml,
      }),
    );
    await expect(
      serviceRequest<string>("rtorrent", "", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: '<?xml version="1.0"?><methodCall></methodCall>',
      }),
    ).resolves.toBe(xml);
  });

  it("still parses a normal JSON response", async () => {
    fetchSpy.mockResolvedValueOnce(
      respond({
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ version: "5.0" }),
      }),
    );
    await expect(serviceRequest("radarr", "/system/status")).resolves.toEqual({
      version: "5.0",
    });
  });
});

// The connection test / health dots must not show green for a proxied service:
// a 2xx that isn't JSON means we reached the proxy's login page, not the API.
describe("testServiceConnection — auth-proxy detection (#239)", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = fetchMock();
    global.fetch = fetchSpy as any;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reports unreachable when the *arr probe gets HTML instead of JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => ({}),
      text: async () => "<html></html>",
      clone() {
        return this;
      },
    });
    const result = await testServiceConnection("radarr", {
      url: "http://radarr.local:7878",
      apiKey: "k",
    });
    expect(result.kind).toBe("unreachable");
  });

  it("reports ok when the *arr probe gets JSON (the default mock)", async () => {
    const result = await testServiceConnection("radarr", {
      url: "http://radarr.local:7878",
      apiKey: "k",
    });
    expect(result.kind).toBe("ok");
  });
});

// External signal (TanStack Query's queryFn signal) composed with the internal
// timeout controller — either firing must abort the fetch (#290).
describe("serviceRequest — signal composition (#290)", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;

  // A fetch that never resolves on its own and rejects the way RN does when
  // its signal aborts: a plain Error named "AbortError" (no DOMException).
  function hangingFetch(): jest.Mock {
    return jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const fail = () =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          if (init.signal.aborted) fail();
          else init.signal.addEventListener("abort", fail);
        }),
    );
  }

  beforeEach(() => {
    originalFetch = global.fetch;
    mockStateRef.current = makeState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("aborts the fetch when the external signal fires mid-flight", async () => {
    fetchSpy = hangingFetch();
    global.fetch = fetchSpy as any;
    const external = new AbortController();
    const promise = serviceRequest("radarr", "/release", {
      signal: external.signal,
    });
    const expectation = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    external.abort();
    await expectation;
  });

  it("rejects immediately when the external signal is already aborted", async () => {
    fetchSpy = hangingFetch();
    global.fetch = fetchSpy as any;
    const external = new AbortController();
    external.abort();
    await expect(
      serviceRequest("radarr", "/release", { signal: external.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("still times out with an unfired external signal attached", async () => {
    jest.useFakeTimers();
    fetchSpy = hangingFetch();
    global.fetch = fetchSpy as any;
    const external = new AbortController();
    const promise = serviceRequest("radarr", "/release", {
      timeout: 5000,
      signal: external.signal,
    });
    const expectation = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    jest.advanceTimersByTime(5001);
    await expectation;
  });

  it("resolves normally with an external signal attached; a later abort is a no-op", async () => {
    fetchSpy = fetchMock();
    global.fetch = fetchSpy as any;
    const external = new AbortController();
    await expect(
      serviceRequest("radarr", "/system/status", { signal: external.signal }),
    ).resolves.toEqual({});
    // The abort listener was removed in the finally — firing it now must not
    // surface an unhandled rejection or throw.
    external.abort();
  });
});

describe("isAbortError", () => {
  it("matches RN's abort rejection shape", () => {
    expect(
      isAbortError(Object.assign(new Error("Aborted"), { name: "AbortError" })),
    ).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(new HttpError(500, "Internal", "http://x.local"))).toBe(
      false,
    );
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
