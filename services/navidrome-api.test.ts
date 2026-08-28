// Mock the http client entirely — navidrome-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment. HttpError is
// re-implemented rather than imported so the 401 re-login branch is testable.
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
  // buildUrl is re-exported by http-client (the convention every other service
  // module follows), but it actually lives in the dependency-free
  // lib/url-builder — so hand the mock the REAL one rather than a stub, and the
  // cover-art URL assertions below test the encoding that ships.
  return {
    serviceRequest: jest.fn(),
    HttpError,
    buildUrl: jest.requireActual("@/lib/url-builder").buildUrl,
  };
});

// Navidrome has no API key, so this module reads username/password itself to
// build the Subsonic salted token and to POST /auth/login.
jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => ({
      getActiveInstanceId: () => "inst-active",
      getActiveUrl: (_kind: string, id: string) =>
        id === "inst-1" ? "https://nd1.example.com" : "https://nd.example.com/",
      instanceSecrets: {
        "inst-active": { username: "admin", password: "sesame" },
        "inst-1": { username: "other", password: "hunter2" },
      },
    }),
  },
}));

import { HttpError, serviceRequest } from "@/lib/http-client";
import { subsonicToken } from "@/lib/navidrome-normalize";
import { SubsonicApiError } from "@/lib/navidrome-normalize";
import {
  deleteAllMissingFiles,
  getAlbumList,
  getArtistCounts,
  getCoverArtSource,
  getCoverArtUrl,
  getLibraries,
  getNowPlaying,
  getOverview,
  getPlaylists,
  getScanStatus,
  getWebUiUrl,
  navidromeClearSession,
  ping,
  search3,
  startScan,
  subsonicAuthParams,
} from "@/services/navidrome-api";

const mockRequest = serviceRequest as jest.MockedFunction<typeof serviceRequest>;

/** Wrap a payload in the Subsonic envelope the way Navidrome does. */
function ok(key: string, payload: unknown) {
  return {
    "subsonic-response": {
      status: "ok",
      version: "1.16.1",
      type: "navidrome",
      serverVersion: "0.63.2",
      openSubsonic: true,
      ...(key ? { [key]: payload } : {}),
    },
  };
}

function failed(code: number, message: string) {
  return {
    "subsonic-response": {
      status: "failed",
      version: "1.16.1",
      error: { code, message },
    },
  };
}

beforeEach(() => {
  mockRequest.mockReset();
  navidromeClearSession();
});

describe("subsonicAuthParams", () => {
  it("sends the salted token, never the password", () => {
    const params = subsonicAuthParams();
    expect(params.u).toBe("admin");
    expect(params.s).toMatch(/^[0-9a-f]{16}$/);
    expect(params.t).toBe(subsonicToken("sesame", params.s));
    expect(params.v).toBe("1.16.1");
    expect(params.c).toBe("Dashboarr");
    expect(params.f).toBe("json");
    expect(Object.values(params)).not.toContain("sesame");
    // The plaintext `p` param exists in the protocol; we must never use it.
    expect(params).not.toHaveProperty("p");
  });

  it("reuses one salt per instance so the token stays cacheable", () => {
    const a = subsonicAuthParams();
    const b = subsonicAuthParams();
    expect(a.s).toBe(b.s);
    expect(a.t).toBe(b.t);
  });

  it("keeps separate salts and credentials per instance", () => {
    const active = subsonicAuthParams();
    const other = subsonicAuthParams("inst-1");
    expect(other.u).toBe("other");
    expect(other.s).not.toBe(active.s);
    expect(other.t).toBe(subsonicToken("hunter2", other.s));
  });

  it("re-derives the salt after the session is cleared", () => {
    const before = subsonicAuthParams().s;
    navidromeClearSession();
    expect(subsonicAuthParams().s).not.toBe(before);
  });
});

describe("Subsonic reads", () => {
  it("calls /rest/getScanStatus and unwraps scanStatus", async () => {
    mockRequest.mockResolvedValueOnce(
      ok("scanStatus", { scanning: false, count: 1234, folderCount: 56, lastScan: "2026-08-20T10:00:00Z" }),
    );
    await expect(getScanStatus()).resolves.toEqual({
      scanning: false,
      count: 1234,
      folderCount: 56,
      lastScan: "2026-08-20T10:00:00Z",
    });
    const [serviceId, path, options] = mockRequest.mock.calls[0];
    expect(serviceId).toBe("navidrome");
    expect(path).toBe("/rest/getScanStatus");
    expect(options?.params).toMatchObject({ u: "admin", v: "1.16.1", c: "Dashboarr", f: "json" });
  });

  // THE trap: Navidrome answers HTTP 200 for every Subsonic error, so
  // serviceRequest resolves and only the body says the password was wrong.
  it("throws on a failed envelope delivered as HTTP 200", async () => {
    mockRequest.mockResolvedValueOnce(failed(40, "Wrong username or password"));
    await expect(getScanStatus()).rejects.toBeInstanceOf(SubsonicApiError);
  });

  it("returns the server version from ping", async () => {
    mockRequest.mockResolvedValueOnce(ok("status", "ok"));
    await expect(ping()).resolves.toBe("0.63.2");
  });

  it("ping rejects on a failed envelope", async () => {
    mockRequest.mockResolvedValueOnce(failed(40, "Wrong username or password"));
    await expect(ping()).rejects.toBeInstanceOf(SubsonicApiError);
  });

  it("flattens getNowPlaying to an array, and empty to []", async () => {
    mockRequest.mockResolvedValueOnce(
      ok("nowPlaying", { entry: [{ id: "1", title: "Song", username: "admin", state: "playing" }] }),
    );
    await expect(getNowPlaying()).resolves.toHaveLength(1);

    // An idle server omits `nowPlaying` entirely rather than sending [].
    mockRequest.mockResolvedValueOnce(ok("", null));
    await expect(getNowPlaying()).resolves.toEqual([]);
  });

  it("sums artists and albums across the getArtists index", async () => {
    mockRequest.mockResolvedValueOnce(
      ok("artists", {
        index: [
          { name: "A", artist: [{ id: "1", name: "Aphex", albumCount: 4 }, { id: "2", name: "Air", albumCount: 3 }] },
          { name: "B", artist: [{ id: "3", name: "Bjork", albumCount: 9 }] },
        ],
      }),
    );
    await expect(getArtistCounts()).resolves.toEqual({ artists: 3, albums: 16 });
  });

  it("tolerates an artist with no albumCount", async () => {
    mockRequest.mockResolvedValueOnce(ok("artists", { index: [{ name: "A", artist: [{ id: "1", name: "X" }] }] }));
    await expect(getArtistCounts()).resolves.toEqual({ artists: 1, albums: 0 });
  });

  it("passes search3 counts through and defaults an empty result", async () => {
    mockRequest.mockResolvedValueOnce(ok("", null));
    await expect(search3("boards", { songCount: 5 })).resolves.toEqual({});
    expect(mockRequest.mock.calls[0][2]?.params).toMatchObject({
      query: "boards",
      songCount: 5,
      artistCount: 10,
      albumCount: 20,
    });
  });

  it("requests getAlbumList2, not the folder-based getAlbumList", async () => {
    mockRequest.mockResolvedValueOnce(ok("albumList2", { album: [{ id: "a", name: "SAW" }] }));
    await expect(getAlbumList("newest", 12, 24)).resolves.toHaveLength(1);
    expect(mockRequest.mock.calls[0][1]).toBe("/rest/getAlbumList2");
    expect(mockRequest.mock.calls[0][2]?.params).toMatchObject({ type: "newest", size: 12, offset: 24 });
  });

  it("returns [] when there are no playlists", async () => {
    mockRequest.mockResolvedValueOnce(ok("playlists", {}));
    await expect(getPlaylists()).resolves.toEqual([]);
  });
});

describe("startScan", () => {
  it("sends fullScan=false for a quick scan and raises the timeout", async () => {
    mockRequest.mockResolvedValueOnce(ok("scanStatus", { scanning: true, count: 0, folderCount: 0 }));
    await startScan(false);
    const options = mockRequest.mock.calls[0][2];
    expect(mockRequest.mock.calls[0][1]).toBe("/rest/startScan");
    expect(options?.params).toMatchObject({ fullScan: false });
    // Upstream blocks up to 3s waiting for the scanner to start.
    expect(options?.timeout).toBe(30_000);
  });

  it("sends fullScan=true for a full scan", async () => {
    mockRequest.mockResolvedValueOnce(ok("scanStatus", { scanning: true, count: 0, folderCount: 0 }));
    await startScan(true);
    expect(mockRequest.mock.calls[0][2]?.params).toMatchObject({ fullScan: true });
  });

  it("surfaces the not-an-admin rejection", async () => {
    mockRequest.mockResolvedValueOnce(failed(50, "User is not authorized"));
    await expect(startScan(false)).rejects.toMatchObject({ code: 50 });
  });
});

describe("native API session", () => {
  it("logs in once, then reuses the jwt across calls", async () => {
    mockRequest
      .mockResolvedValueOnce({ token: "jwt-1", isAdmin: true, id: "u", name: "Admin", username: "admin" })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getLibraries();
    await getLibraries();

    expect(mockRequest.mock.calls[0][1]).toBe("/auth/login");
    expect(mockRequest.mock.calls[0][2]?.method).toBe("POST");
    expect(JSON.parse(String(mockRequest.mock.calls[0][2]?.body))).toEqual({
      username: "admin",
      password: "sesame",
    });
    // Second and third calls are the library reads, both carrying the jwt.
    expect(mockRequest.mock.calls[1][1]).toBe("/api/library");
    expect(mockRequest.mock.calls[1][2]?.headers).toEqual({
      "X-ND-Authorization": "Bearer jwt-1",
    });
    expect(mockRequest.mock.calls[2][1]).toBe("/api/library");
    // Exactly one login for two reads: /auth/login is rate limited upstream.
    expect(mockRequest.mock.calls.filter((c) => c[1] === "/auth/login")).toHaveLength(1);
  });

  it("collapses concurrent callers onto a single login", async () => {
    mockRequest.mockImplementation(async (_id, path) => {
      if (path === "/auth/login") {
        return { token: "jwt-1", isAdmin: true, id: "u", name: "A", username: "admin" } as never;
      }
      return [] as never;
    });
    await Promise.all([getLibraries(), getLibraries(), getLibraries()]);
    expect(mockRequest.mock.calls.filter((c) => c[1] === "/auth/login")).toHaveLength(1);
  });

  it("re-logs in exactly once when the jwt is rejected", async () => {
    mockRequest
      .mockResolvedValueOnce({ token: "jwt-old", isAdmin: true, id: "u", name: "A", username: "admin" })
      .mockRejectedValueOnce(new HttpError(401, "Unauthorized", "https://nd.example.com"))
      .mockResolvedValueOnce({ token: "jwt-new", isAdmin: true, id: "u", name: "A", username: "admin" })
      .mockResolvedValueOnce([]);

    await expect(getLibraries()).resolves.toEqual([]);
    const logins = mockRequest.mock.calls.filter((c) => c[1] === "/auth/login");
    expect(logins).toHaveLength(2);
    expect(mockRequest.mock.calls.at(-1)?.[2]?.headers).toEqual({
      "X-ND-Authorization": "Bearer jwt-new",
    });
  });

  it("does not retry a non-401 failure", async () => {
    mockRequest
      .mockResolvedValueOnce({ token: "jwt-1", isAdmin: true, id: "u", name: "A", username: "admin" })
      .mockRejectedValueOnce(new HttpError(500, "Internal Server Error", "https://nd.example.com"));
    await expect(getLibraries()).rejects.toMatchObject({ status: 500 });
    expect(mockRequest.mock.calls.filter((c) => c[1] === "/auth/login")).toHaveLength(1);
  });

  // No `id` param means "delete them all" (server/nativeapi/missing.go). Sending
  // ids would delete only those, which is not the action this offers.
  it("deletes all missing files with no id filter", async () => {
    mockRequest
      .mockResolvedValueOnce({ token: "jwt-1", isAdmin: true, id: "u", name: "A", username: "admin" })
      .mockResolvedValueOnce({ ids: [] });
    await deleteAllMissingFiles();
    const [, path, options] = mockRequest.mock.calls[1];
    expect(path).toBe("/api/missing");
    expect(options?.method).toBe("DELETE");
    expect(options?.params).toBeUndefined();
  });
});

describe("getOverview", () => {
  it("uses /api/library for an admin so total size is reported", async () => {
    mockRequest.mockImplementation(async (_id, path) => {
      if (path === "/rest/getUser") return ok("user", { username: "admin", adminRole: true }) as never;
      if (path === "/rest/getScanStatus")
        return ok("scanStatus", { scanning: false, count: 1234, folderCount: 5 }) as never;
      if (path === "/auth/login")
        return { token: "jwt", isAdmin: true, id: "u", name: "A", username: "admin" } as never;
      if (path === "/api/library")
        return [
          {
            id: 1, name: "Music", path: "/music",
            lastScanAt: "2026-08-20T10:00:00Z", lastScanStartedAt: "2026-08-20T09:00:00Z",
            fullScanInProgress: false,
            totalSongs: 1234, totalAlbums: 90, totalArtists: 40, totalFolders: 5,
            totalFiles: 1240, totalMissingFiles: 6, totalSize: 9_999, totalDuration: 100,
          },
        ] as never;
      throw new Error(`unexpected ${path}`);
    });

    const overview = await getOverview();
    expect(overview.isAdmin).toBe(true);
    expect(overview.summary).toMatchObject({
      source: "library",
      songs: 1234,
      albums: 90,
      artists: 40,
      sizeBytes: 9_999,
      missing: 6,
    });
  });

  // /api/library's fullScanInProgress only flips for a FULL scan, so a running
  // quick scan would read as idle without folding getScanStatus in.
  it("takes the live scanning flag from getScanStatus", async () => {
    mockRequest.mockImplementation(async (_id, path) => {
      if (path === "/rest/getUser") return ok("user", { username: "admin", adminRole: true }) as never;
      if (path === "/rest/getScanStatus")
        return ok("scanStatus", { scanning: true, count: 1, folderCount: 1 }) as never;
      if (path === "/auth/login")
        return { token: "jwt", isAdmin: true, id: "u", name: "A", username: "admin" } as never;
      if (path === "/api/library")
        return [
          {
            id: 1, name: "M", path: "/m", lastScanAt: "2026-08-20T10:00:00Z",
            lastScanStartedAt: "", fullScanInProgress: false,
            totalSongs: 1, totalAlbums: 1, totalArtists: 1, totalFolders: 1,
            totalFiles: 1, totalMissingFiles: 0, totalSize: 1, totalDuration: 1,
          },
        ] as never;
      throw new Error(`unexpected ${path}`);
    });
    await expect(getOverview()).resolves.toMatchObject({ summary: { scanning: true } });
  });

  // /api/library is behind adminOnlyMiddleware; a plain account must still get
  // a useful Overview rather than an error screen.
  it("falls back to Subsonic for a non-admin, and never calls /api/library", async () => {
    mockRequest.mockImplementation(async (_id, path) => {
      if (path === "/rest/getUser") return ok("user", { username: "bob", adminRole: false }) as never;
      if (path === "/rest/getScanStatus")
        return ok("scanStatus", { scanning: false, count: 500, folderCount: 3, lastScan: "2026-08-20T10:00:00Z" }) as never;
      if (path === "/rest/getArtists")
        return ok("artists", { index: [{ name: "A", artist: [{ id: "1", name: "A", albumCount: 2 }] }] }) as never;
      throw new Error(`unexpected ${path}`);
    });

    const overview = await getOverview();
    expect(overview.isAdmin).toBe(false);
    expect(overview.summary).toMatchObject({
      source: "scanStatus",
      songs: 500,
      artists: 1,
      albums: 2,
      sizeBytes: null,
      missing: null,
    });
    expect(mockRequest.mock.calls.some((c) => c[1] === "/api/library")).toBe(false);
    expect(mockRequest.mock.calls.some((c) => c[1] === "/auth/login")).toBe(false);
  });

  it("degrades to Subsonic when an admin's login is unreachable", async () => {
    mockRequest.mockImplementation(async (_id, path) => {
      if (path === "/rest/getUser") return ok("user", { username: "admin", adminRole: true }) as never;
      if (path === "/rest/getScanStatus")
        return ok("scanStatus", { scanning: false, count: 7, folderCount: 1 }) as never;
      if (path === "/rest/getArtists") return ok("artists", { index: [] }) as never;
      if (path === "/auth/login") throw new HttpError(429, "Too Many Requests", "https://nd.example.com");
      throw new Error(`unexpected ${path}`);
    });
    const overview = await getOverview();
    expect(overview.summary.source).toBe("scanStatus");
    expect(overview.summary.songs).toBe(7);
  });
});

describe("URL builders", () => {
  it("builds an authenticated cover-art URL", () => {
    const url = getCoverArtUrl("al-123", 200);
    expect(url).toContain("https://nd.example.com/rest/getCoverArt?");
    expect(url).toContain("id=al-123");
    expect(url).toContain("size=200");
    expect(url).toContain("u=admin");
    expect(url).not.toContain("sesame");
  });

  it("returns empty for a missing coverArt id", () => {
    expect(getCoverArtUrl(undefined)).toBe("");
    expect(getCoverArtSource(undefined)).toBeNull();
  });

  // The credential rotates with the salt; keeping it in the cache key would
  // re-download every cover after a re-login.
  it("strips the credential from the image cache key", () => {
    const source = getCoverArtSource("al-123", 200)!;
    expect(source.cacheKey).toContain("id=al-123");
    expect(source.cacheKey).toContain("size=200");
    expect(source.cacheKey).not.toMatch(/[?&](u|t|s|c|f|v)=/);
  });

  it("builds hash-router deep links into the Navidrome web UI", () => {
    expect(getWebUiUrl("album", "al-1")).toBe("https://nd.example.com/app/#/album/al-1/show");
    expect(getWebUiUrl("playlist", "pl-9", "inst-1")).toBe(
      "https://nd1.example.com/app/#/playlist/pl-9/show",
    );
    expect(getWebUiUrl("album")).toBe("https://nd.example.com/app/");
  });
});
