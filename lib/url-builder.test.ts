import { buildUrl } from "./url-builder";

describe("buildUrl", () => {
  it("composes a plain base + api base + path", () => {
    expect(buildUrl("http://10.0.0.5:7878", "/api/v3", "/system/status")).toBe(
      "http://10.0.0.5:7878/api/v3/system/status",
    );
  });

  it("preserves a reverse-proxy prefix on the base URL", () => {
    expect(buildUrl("http://myhost:7878/radarr", "/api/v3", "/system/status")).toBe(
      "http://myhost:7878/radarr/api/v3/system/status",
    );
  });

  it("normalizes a trailing slash on the base URL", () => {
    expect(buildUrl("http://myhost:7878/radarr/", "/api/v3", "/system/status")).toBe(
      "http://myhost:7878/radarr/api/v3/system/status",
    );
  });

  it("handles an empty api base path (Plex)", () => {
    expect(buildUrl("http://plex.local:32400", "", "/identity")).toBe(
      "http://plex.local:32400/identity",
    );
  });

  it("appends query params via searchParams", () => {
    const url = buildUrl("http://myhost:7878/radarr", "/api/v3", "/movie/lookup", {
      term: "blade runner",
    });
    expect(url).toBe(
      "http://myhost:7878/radarr/api/v3/movie/lookup?term=blade+runner",
    );
  });

  it("works with https and a deep proxy prefix", () => {
    expect(
      buildUrl("https://media.example.com/svc/sonarr", "/api/v3", "/series"),
    ).toBe("https://media.example.com/svc/sonarr/api/v3/series");
  });
});
