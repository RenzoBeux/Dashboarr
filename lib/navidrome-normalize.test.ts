import {
  SubsonicApiError,
  isSubsonicAuthError,
  randomSalt,
  readSubsonicEnvelope,
  scanStatusToSummary,
  subsonicErrorMessage,
  subsonicToken,
  summarizeLibraries,
  unwrapSubsonic,
  type NavidromeLibrary,
} from "@/lib/navidrome-normalize";

function library(over: Partial<NavidromeLibrary> = {}): NavidromeLibrary {
  return {
    id: 1,
    name: "Music Library",
    path: "/music",
    lastScanAt: "2026-08-20T10:00:00Z",
    lastScanStartedAt: "2026-08-20T09:58:00Z",
    fullScanInProgress: false,
    totalSongs: 100,
    totalAlbums: 10,
    totalArtists: 5,
    totalFolders: 12,
    totalFiles: 110,
    totalMissingFiles: 2,
    totalSize: 1_000,
    totalDuration: 3_600,
    ...over,
  };
}

describe("subsonicToken", () => {
  // The worked example from the Subsonic API spec: password "sesame", salt
  // "c19b2d" => 26719a1196d2a940705a59634eb18eab. Navidrome computes the same
  // thing in server/subsonic/middlewares.go:validateCredentials.
  it("reproduces the Subsonic spec's md5(password + salt) vector", () => {
    expect(subsonicToken("sesame", "c19b2d")).toBe(
      "26719a1196d2a940705a59634eb18eab",
    );
  });

  it("is salt-dependent, so a reused token can't be replayed under a new salt", () => {
    expect(subsonicToken("sesame", "aaaa")).not.toBe(subsonicToken("sesame", "bbbb"));
  });

  it("handles unicode passwords by bytes, not code units", () => {
    // md5("pässwörd" + "salt") — the point is that it doesn't throw and is stable.
    expect(subsonicToken("pässwörd", "salt")).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("randomSalt", () => {
  it("returns lowercase hex", () => {
    expect(randomSalt()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("unwrapSubsonic", () => {
  it("returns the payload under the requested key", () => {
    const body = {
      "subsonic-response": {
        status: "ok",
        version: "1.16.1",
        scanStatus: { scanning: false, count: 42, folderCount: 3 },
      },
    };
    expect(unwrapSubsonic(body, "scanStatus")).toEqual({
      scanning: false,
      count: 42,
      folderCount: 3,
    });
  });

  // The load-bearing case: Navidrome answers HTTP 200 for EVERY Subsonic error
  // (sendResponse in server/subsonic/api.go sets no status), so serviceRequest
  // resolves and the body is the only signal. Without this throw a wrong
  // password reads as an empty library.
  it("throws SubsonicApiError on a failed envelope even though HTTP was 200", () => {
    const body = {
      "subsonic-response": {
        status: "failed",
        version: "1.16.1",
        error: { code: 40, message: "Wrong username or password" },
      },
    };
    expect(() => unwrapSubsonic(body, "scanStatus")).toThrow(SubsonicApiError);
    try {
      unwrapSubsonic(body, "scanStatus");
    } catch (err) {
      expect((err as SubsonicApiError).code).toBe(40);
      expect((err as SubsonicApiError).message).toBe("Wrong username or password");
    }
  });

  it("rejects a body that isn't a Subsonic envelope at all", () => {
    expect(() => unwrapSubsonic({ hello: "world" }, "scanStatus")).toThrow(
      /subsonic-response/,
    );
  });

  it("returns undefined for an ok envelope with no payload (empty result)", () => {
    const body = { "subsonic-response": { status: "ok", version: "1.16.1" } };
    expect(unwrapSubsonic(body, "nowPlaying")).toBeUndefined();
  });
});

describe("readSubsonicEnvelope", () => {
  it("reads the envelope without needing a payload key", () => {
    const body = { "subsonic-response": { status: "ok", version: "1.16.1", serverVersion: "0.63.2" } };
    expect(readSubsonicEnvelope(body)?.serverVersion).toBe("0.63.2");
  });

  it("returns null for a non-Subsonic body", () => {
    expect(readSubsonicEnvelope("<html>login</html>")).toBeNull();
  });
});

describe("error classification", () => {
  it.each([40, 41, 42, 43, 44, 50])("treats code %i as an auth failure", (code) => {
    expect(isSubsonicAuthError(code)).toBe(true);
  });

  it.each([0, 10, 20, 30, 60, 70])("treats code %i as a non-auth failure", (code) => {
    expect(isSubsonicAuthError(code)).toBe(false);
  });

  it("names the common codes", () => {
    expect(subsonicErrorMessage(40)).toBe("Wrong username or password");
    expect(subsonicErrorMessage(50)).toBe("This account is not allowed to do that");
  });

  it("falls back to the server's own message for an unknown code", () => {
    expect(subsonicErrorMessage(999, "something new")).toBe("something new");
  });

  it("still says something useful with no fallback", () => {
    expect(subsonicErrorMessage(999)).toBe("Subsonic error 999");
  });
});

describe("summarizeLibraries", () => {
  it("sums every counter across libraries", () => {
    const summary = summarizeLibraries([
      library({ id: 1, totalSongs: 100, totalAlbums: 10, totalArtists: 5, totalSize: 1_000, totalDuration: 3_600, totalMissingFiles: 2, totalFolders: 12 }),
      library({ id: 2, totalSongs: 50, totalAlbums: 4, totalArtists: 3, totalSize: 500, totalDuration: 1_800, totalMissingFiles: 1, totalFolders: 6 }),
    ]);
    expect(summary).toMatchObject({
      songs: 150,
      albums: 14,
      artists: 8,
      sizeBytes: 1_500,
      durationSec: 5_400,
      missing: 3,
      folders: 18,
      source: "library",
    });
  });

  it("takes the most recent lastScanAt across libraries", () => {
    const summary = summarizeLibraries([
      library({ id: 1, lastScanAt: "2026-08-01T00:00:00Z" }),
      library({ id: 2, lastScanAt: "2026-08-20T10:00:00Z" }),
    ]);
    expect(summary.lastScanAt).toBe("2026-08-20T10:00:00Z");
  });

  // Go marshals a never-set time.Time as 0001-01-01T00:00:00Z. Rendering that
  // through formatTimeAgo would claim the library was scanned 2000 years ago.
  it("treats Go's zero time as never scanned", () => {
    const summary = summarizeLibraries([library({ lastScanAt: "0001-01-01T00:00:00Z" })]);
    expect(summary.lastScanAt).toBeNull();
  });

  it("reports scanning when any library has a full scan in progress", () => {
    const summary = summarizeLibraries([
      library({ id: 1, fullScanInProgress: false }),
      library({ id: 2, fullScanInProgress: true }),
    ]);
    expect(summary.scanning).toBe(true);
  });

  it("zeroes out cleanly for an empty list", () => {
    expect(summarizeLibraries([])).toMatchObject({
      songs: 0,
      albums: 0,
      artists: 0,
      sizeBytes: 0,
      lastScanAt: null,
      scanning: false,
    });
  });
});

describe("scanStatusToSummary", () => {
  // The non-admin path: /api/library is behind adminOnlyMiddleware, so a plain
  // account gets tracks + folders + lastScan from Subsonic and nothing else.
  it("maps getScanStatus and leaves the admin-only fields null", () => {
    const summary = scanStatusToSummary({
      scanning: false,
      count: 1234,
      folderCount: 56,
      lastScan: "2026-08-20T10:00:00Z",
    });
    expect(summary).toEqual({
      artists: null,
      albums: null,
      songs: 1234,
      sizeBytes: null,
      durationSec: null,
      missing: null,
      folders: 56,
      lastScanAt: "2026-08-20T10:00:00Z",
      scanning: false,
      source: "scanStatus",
    });
  });

  it("folds in getArtists counts when they were fetched", () => {
    const summary = scanStatusToSummary(
      { scanning: true, count: 10, folderCount: 2 },
      { artists: 7, albums: 9 },
    );
    expect(summary).toMatchObject({ artists: 7, albums: 9, scanning: true });
  });

  it("treats a missing lastScan as never scanned", () => {
    expect(scanStatusToSummary({ scanning: false, count: 0, folderCount: 0 }).lastScanAt).toBeNull();
  });
});
