// The api module's parsers are pure, but the module itself imports
// http-client -> config-store -> AsyncStorage. Stub the chain; getDemoResponse
// and the normalizers have no such dependency.
jest.mock("@/components/indexers/nzbhydra2-grab-flow", () => ({
  Nzbhydra2GrabFlow: () => null,
}));
jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));
jest.mock("@/store/config-store", () => ({
  useConfigStore: Object.assign(() => undefined, {
    getState: () => ({ getActiveInstanceId: () => null, instanceSecrets: {} }),
  }),
}));

import { getDemoResponse } from "@/lib/demo-data";
import { parseCapsResponse, parseSearchResponse } from "@/services/nzbhydra2-api";
import { nzbhydra2ToUnified } from "@/lib/indexer-adapters/nzbhydra2";
import {
  hydraCapsVersion,
  hydraStateMeta,
  parseHydraTimestamp,
} from "@/lib/nzbhydra2-normalize";
import type {
  Nzbhydra2DownloadHistoryRow,
  Nzbhydra2HistoryPage,
  Nzbhydra2IndexerStatus,
  Nzbhydra2SearchHistoryRow,
  Nzbhydra2StatsResponse,
} from "@/lib/types";

// Demo mode is the only place outside these unit tests where an NZBHydra2
// payload is produced end to end, so the fixtures are pushed through the REAL
// parsers rather than eyeballed. A fixture that drifts from the wire shape
// would otherwise make demo mode look correct while the live integration
// breaks — which matters more here than usual, because NZBHydra2's "@attributes"
// holders fail silently rather than loudly.

describe("nzbhydra2 demo fixtures", () => {
  it("tells caps and search apart on the shared /api path via `t`", () => {
    // Both live at /api, so getDemoResponse has to discriminate on the param.
    const caps = getDemoResponse("nzbhydra2", "/api", { t: "caps", o: "json" });
    const search = getDemoResponse("nzbhydra2", "/api", {
      t: "search",
      o: "json",
      q: "demo",
    });
    expect(caps).not.toEqual(search);
    // Read through the accessor, since the fixture uses the bare `attributes`
    // spelling a real (native-build) server sends.
    expect(hydraCapsVersion(parseCapsResponse(caps))).toBe("8.9.0");
    expect(parseSearchResponse(search).length).toBeGreaterThan(0);
  });

  it("produces search items the real mapper can read", () => {
    const items = parseSearchResponse(
      getDemoResponse("nzbhydra2", "/api", { t: "search", o: "json", q: "demo" }),
    );
    const releases = items.map(nzbhydra2ToUnified);

    // Every row must carry a real originating indexer and a real size — the two
    // things a mis-keyed "@attributes" lookup silently destroys.
    for (const r of releases) {
      expect(r.indexer).not.toBe("NZBHydra2");
      expect(r.sizeBytes).toBeGreaterThan(0);
      expect(r.protocol).toBe("usenet");
      expect(r.seeders).toBeUndefined();
    }
    expect(new Set(releases.map((r) => r.id)).size).toBe(releases.length);
  });

  it("serves indexer statuses as a bare array with parseable timestamps", () => {
    const raw = getDemoResponse("nzbhydra2", "/api/stats/indexers");
    expect(Array.isArray(raw)).toBe(true);

    const rows = raw as Nzbhydra2IndexerStatus[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Unknown states fall back to the raw string, so this asserts the
      // fixtures use states the palette actually knows.
      expect(hydraStateMeta(row.state).label).not.toBe(row.state);
      if (row.disabledUntil !== null) {
        expect(parseHydraTimestamp(row.disabledUntil)).toEqual(expect.any(Number));
      }
    }
    // Exercises both the hit-limit meter and the "no limit published" branch.
    expect(rows.some((r) => r.apiHitLimit != null)).toBe(true);
    expect(rows.some((r) => r.apiHitLimit == null)).toBe(true);
    // And both the disabled-with-error and healthy paths.
    expect(rows.some((r) => r.lastError)).toBe(true);
    expect(rows.some((r) => r.state === "ENABLED")).toBe(true);
  });

  it("serves stats with the sections the Stats tab actually renders", () => {
    const stats = getDemoResponse("nzbhydra2", "/api/stats") as Nzbhydra2StatsResponse;
    // These four are exactly the flags hooks/use-nzbhydra2.ts opts into.
    expect(stats.indexerApiAccessStats?.length).toBeGreaterThan(0);
    expect(stats.avgResponseTimes?.length).toBeGreaterThan(0);
    expect(stats.indexerDownloadShares?.length).toBeGreaterThan(0);
    expect(stats.successfulDownloadsPerIndexer?.length).toBeGreaterThan(0);
    // Always populated whatever was requested.
    expect(stats.numberOfEnabledIndexers).toEqual(expect.any(Number));
    expect(stats.numberOfConfiguredIndexers).toEqual(expect.any(Number));
  });

  it.each([
    ["/api/history/searches"],
    ["/api/history/downloads"],
  ])("serves %s in a terminating Page<T> envelope", (path) => {
    const page = getDemoResponse("nzbhydra2", path) as Nzbhydra2HistoryPage<unknown>;
    expect(page.content.length).toBeGreaterThan(0);
    // `last: true` stops the infinite query; `number` is zero-based even though
    // the request page is one-based.
    expect(page.last).toBe(true);
    expect(page.number).toBe(0);
  });

  it("includes a download row whose search result was purged", () => {
    // The History tab falls back to "(release no longer in the database)" for
    // these, so the fixture has to cover it.
    const page = getDemoResponse(
      "nzbhydra2",
      "/api/history/downloads",
    ) as Nzbhydra2HistoryPage<Nzbhydra2DownloadHistoryRow>;
    expect(page.content.some((r) => r.searchResult === null)).toBe(true);
  });

  it("includes an API search with no query text", () => {
    // A media-id search (Sonarr/Radarr) records no query, which is why the row
    // falls back rather than rendering a blank title.
    const page = getDemoResponse(
      "nzbhydra2",
      "/api/history/searches",
    ) as Nzbhydra2HistoryPage<Nzbhydra2SearchHistoryRow>;
    expect(page.content.some((r) => !r.query)).toBe(true);
  });

  it("returns undefined for an unknown path instead of a wrong fixture", () => {
    expect(getDemoResponse("nzbhydra2", "/api/nope")).toBeUndefined();
  });
});
