import { buildAuthUrl, discoverServers } from "./plex-auth";

function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const CLIENT_ID = "client-123";
const ACCOUNT_TOKEN = "account-tok";

describe("buildAuthUrl", () => {
  it("encodes params in the URL fragment with the nested context key", () => {
    const url = buildAuthUrl("pin-code", CLIENT_ID, "dashboarr://plex-auth");
    expect(url.startsWith("https://app.plex.tv/auth#?")).toBe(true);
    expect(url).toContain("clientID=client-123");
    expect(url).toContain("code=pin-code");
    // context[device][product] must be percent-encoded
    expect(url).toContain("context%5Bdevice%5D%5Bproduct%5D=Dashboarr");
    expect(url).toContain(
      "forwardUrl=" + encodeURIComponent("dashboarr://plex-auth"),
    );
  });

  it("omits forwardUrl when no redirect is given (the WebView flow default)", () => {
    const url = buildAuthUrl("pin-code", CLIENT_ID);
    expect(url).toContain("clientID=client-123");
    expect(url).not.toContain("forwardUrl");
  });
});

describe("discoverServers", () => {
  it("keeps only resources that provide a server", async () => {
    mockFetchOnce([
      { name: "A player", clientIdentifier: "p1", provides: "player", owned: true, connections: [] },
      {
        name: "My PMS",
        clientIdentifier: "s1",
        provides: "server,player",
        owned: true,
        accessToken: "tok-s1",
        connections: [],
      },
    ]);
    const servers = await discoverServers(ACCOUNT_TOKEN, CLIENT_ID);
    expect(servers.map((s) => s.name)).toEqual(["My PMS"]);
  });

  it("maps local→localUrl, public direct→remoteUrl, preferring https and IPv4", async () => {
    mockFetchOnce([
      {
        name: "Homelab",
        clientIdentifier: "s1",
        provides: "server",
        owned: true,
        accessToken: "tok-s1",
        connections: [
          { protocol: "http", address: "192.168.1.10", port: 32400, uri: "http://192.168.1.10:32400", local: true, relay: false, IPv6: false },
          { protocol: "https", address: "192.168.1.10", port: 32400, uri: "https://192-168-1-10.abc.plex.direct:32400", local: true, relay: false, IPv6: false },
          { protocol: "https", address: "fe80::1", port: 32400, uri: "https://[fe80::1]:32400", local: false, relay: false, IPv6: true },
          { protocol: "https", address: "1.2.3.4", port: 32400, uri: "https://1-2-3-4.abc.plex.direct:32400", local: false, relay: false, IPv6: false },
          { protocol: "https", address: "relay", port: 443, uri: "https://relay.plex.direct:443", local: false, relay: true, IPv6: false },
        ],
      },
    ]);
    const [s] = await discoverServers(ACCOUNT_TOKEN, CLIENT_ID);
    expect(s.localUrl).toBe("https://192-168-1-10.abc.plex.direct:32400"); // https over http
    expect(s.remoteUrl).toBe("https://1-2-3-4.abc.plex.direct:32400"); // IPv4 over IPv6
    expect(s.accessToken).toBe("tok-s1"); // per-resource token
  });

  it("prefers a reachable home-LAN address over a Docker bridge address for local", async () => {
    mockFetchOnce([
      {
        name: "Dockerized",
        clientIdentifier: "s4",
        provides: "server",
        owned: true,
        accessToken: "tok-s4",
        connections: [
          { protocol: "https", address: "172.21.0.1", port: 32400, uri: "https://172-21-0-1.abc.plex.direct:32400", local: true, relay: false, IPv6: false },
          { protocol: "https", address: "192.168.1.50", port: 32400, uri: "https://192-168-1-50.abc.plex.direct:32400", local: true, relay: false, IPv6: false },
        ],
      },
    ]);
    const [s] = await discoverServers(ACCOUNT_TOKEN, CLIENT_ID);
    expect(s.localUrl).toBe("https://192-168-1-50.abc.plex.direct:32400");
  });

  it("falls back to a relay connection for remoteUrl when no direct public one exists", async () => {
    mockFetchOnce([
      {
        name: "RelayOnly",
        clientIdentifier: "s2",
        provides: "server",
        owned: true,
        accessToken: "tok-s2",
        connections: [
          { protocol: "http", address: "10.0.0.5", port: 32400, uri: "http://10.0.0.5:32400", local: true, relay: false, IPv6: false },
          { protocol: "https", address: "relay", port: 443, uri: "https://relay.plex.direct:443", local: false, relay: true, IPv6: false },
        ],
      },
    ]);
    const [s] = await discoverServers(ACCOUNT_TOKEN, CLIENT_ID);
    expect(s.localUrl).toBe("http://10.0.0.5:32400");
    expect(s.remoteUrl).toBe("https://relay.plex.direct:443");
  });

  it("falls back to the account token when a resource omits its accessToken", async () => {
    mockFetchOnce([
      { name: "NoTok", clientIdentifier: "s3", provides: "server", owned: true, connections: [] },
    ]);
    const [s] = await discoverServers(ACCOUNT_TOKEN, CLIENT_ID);
    expect(s.accessToken).toBe(ACCOUNT_TOKEN);
    expect(s.localUrl).toBe("");
    expect(s.remoteUrl).toBe("");
  });

  it("throws on a non-OK discovery response", async () => {
    mockFetchOnce([], { ok: false, status: 401 });
    await expect(discoverServers(ACCOUNT_TOKEN, CLIENT_ID)).rejects.toThrow(/401/);
  });
});
