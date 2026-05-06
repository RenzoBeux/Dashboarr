import { serviceRequest, pingService } from "./http-client";

// jest.mock factories run before module-scope code; the only refs allowed
// inside are auto-imports + names prefixed with `mock`.
const mockStateRef: { current: any } = { current: null };

jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => mockStateRef.current,
  },
}));

interface FakeServiceConfig {
  enabled: boolean;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
}

interface FakeState {
  demoMode: boolean;
  services: Record<string, FakeServiceConfig>;
  secrets: Record<string, { apiKey?: string; username?: string; password?: string; customHeaders?: Record<string, string> }>;
  globalCustomHeaders: Record<string, string>;
  getActiveUrl: (id: string) => string;
  getMergedHeaders: (id: string) => Record<string, string>;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  const state: FakeState = {
    demoMode: false,
    services: {
      radarr: { enabled: true, localUrl: "http://radarr.local:7878", remoteUrl: "", useRemote: false },
      sonarr: { enabled: true, localUrl: "http://sonarr.local:8989", remoteUrl: "", useRemote: false },
      plex: { enabled: true, localUrl: "http://plex.local:32400", remoteUrl: "", useRemote: false },
      jellyfin: { enabled: true, localUrl: "http://jelly.local:8096", remoteUrl: "", useRemote: false },
      glances: { enabled: true, localUrl: "http://glances.local:61208", remoteUrl: "", useRemote: false },
    },
    secrets: {
      radarr: { apiKey: "radarr-key" },
      sonarr: { apiKey: "sonarr-key" },
      plex: { apiKey: "plex-token" },
      jellyfin: { apiKey: "jelly-token" },
      glances: { username: "u", password: "p" },
    },
    globalCustomHeaders: {},
    getActiveUrl(id) {
      return this.services[id]?.localUrl ?? "";
    },
    getMergedHeaders(id) {
      return {
        ...this.globalCustomHeaders,
        ...(this.secrets[id]?.customHeaders ?? {}),
      };
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
