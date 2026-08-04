// Mock the http client entirely — jackett-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import {
  assertIndexersUsable,
  getIndexers,
  parseIndexersXml,
  searchAll,
  testIndexer,
} from "@/services/jackett-api";
import type { JackettIndexerResult, JackettResultsResponse } from "@/lib/types";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
});

const MULTI_XML = `<?xml version="1.0" encoding="utf-8"?>
<indexers>
  <indexer id="1337x" configured="true">
    <title>1337x</title>
    <description>1337x is a Public torrent site</description>
    <link>https://1337x.to/</link>
    <language>en-US</language>
    <type>public</type>
  </indexer>
  <indexer id="beyond-hd" configured="true">
    <title>Beyond-HD</title>
    <description>BeyondHD is a Private site for HD content</description>
    <link>https://beyond-hd.me/</link>
    <language>en-US</language>
    <type>private</type>
  </indexer>
</indexers>`;

const SINGLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<indexers>
  <indexer id="solo" configured="false">
    <title>Solo</title>
    <type>semi-private</type>
  </indexer>
</indexers>`;

describe("parseIndexersXml", () => {
  it("parses a multi-indexer document", () => {
    expect(parseIndexersXml(MULTI_XML)).toEqual([
      {
        id: "1337x",
        name: "1337x",
        type: "public",
        configured: true,
        description: "1337x is a Public torrent site",
      },
      {
        id: "beyond-hd",
        name: "Beyond-HD",
        type: "private",
        configured: true,
        description: "BeyondHD is a Private site for HD content",
      },
    ]);
  });

  it("keeps a single indexer as a one-element array (fast-xml-parser collapse quirk)", () => {
    expect(parseIndexersXml(SINGLE_XML)).toEqual([
      {
        id: "solo",
        name: "Solo",
        type: "semi-private",
        configured: false,
        description: undefined,
      },
    ]);
  });

  it("returns [] for an empty or unexpected document", () => {
    expect(parseIndexersXml("<indexers></indexers>")).toEqual([]);
    expect(parseIndexersXml("<error code=\"100\" description=\"Invalid API Key\"/>")).toEqual([]);
  });

  it("skips entries without an id and falls back name to id when title is missing", () => {
    const xml = `<indexers>
      <indexer configured="true"><title>NoId</title></indexer>
      <indexer id="bare" configured="true"></indexer>
    </indexers>`;
    expect(parseIndexersXml(xml)).toEqual([
      { id: "bare", name: "bare", type: "unknown", configured: true, description: undefined },
    ]);
  });
});

describe("getIndexers", () => {
  it("GETs the Torznab meta endpoint and parses the XML string", async () => {
    mockRequest.mockResolvedValue(SINGLE_XML);
    const result = await getIndexers("inst-1");
    expect(mockRequest).toHaveBeenCalledWith(
      "jackett",
      "/indexers/all/results/torznab/api",
      { params: { t: "indexers", configured: "true" }, instanceId: "inst-1" },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("solo");
  });
});

describe("searchAll", () => {
  it("GETs the JSON results endpoint with the query", async () => {
    const payload = { Results: [], Indexers: [] };
    mockRequest.mockResolvedValue(payload);
    await expect(searchAll("ubuntu", "inst-2")).resolves.toBe(payload);
    expect(mockRequest).toHaveBeenCalledWith("jackett", "/indexers/all/results", {
      params: { Query: "ubuntu" },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-2",
      signal: undefined,
    });
  });

  // The 15s default aborts a fan-out that was going to succeed (#314), and
  // without the signal a hung fetch outlives the search that started it.
  it("uses the interactive-search timeout and forwards the abort signal", async () => {
    mockRequest.mockResolvedValue({ Results: [], Indexers: [] });
    const controller = new AbortController();
    await searchAll("ubuntu", "inst-2", controller.signal);
    const opts = mockRequest.mock.calls[0][2];
    expect(opts.timeout).toBe(INTERACTIVE_SEARCH_TIMEOUT);
    expect(opts.signal).toBe(controller.signal);
  });

  it("rejects when the 200 body says every indexer failed", async () => {
    mockRequest.mockResolvedValue(response(0, [{ Name: "1337x", Error: "boom" }]));
    await expect(searchAll("ubuntu")).rejects.toThrow(
      "1 of 1 indexer failed. 1337x: boom",
    );
  });

  // The tracker is a path segment, not a query param — "all" is just Jackett's
  // meta-indexer id for the same route.
  it("scopes to one tracker when given an indexerId", async () => {
    mockRequest.mockResolvedValue({ Results: [], Indexers: [] });
    await searchAll("ubuntu", "inst-2", undefined, "1337x");
    expect(mockRequest.mock.calls[0][1]).toBe("/indexers/1337x/results");
  });
});

describe("testIndexer", () => {
  const row = (over: Partial<JackettIndexerResult> = {}): JackettIndexerResult => ({
    ID: "1337x",
    Name: "1337x",
    Status: 0,
    Results: 12,
    Error: null,
    ElapsedTime: 340,
    ...over,
  });

  // Mirrors IndexerManagerService.TestIndexer: empty SearchTerm, one indexer.
  it("browses the single indexer with an empty query", async () => {
    mockRequest.mockResolvedValue({ Results: [], Indexers: [row()] });
    await expect(testIndexer("1337x", "inst-3")).resolves.toEqual({
      ok: true,
      results: 12,
      elapsedMs: 340,
    });
    expect(mockRequest).toHaveBeenCalledWith("jackett", "/indexers/1337x/results", {
      params: { Query: "" },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-3",
      signal: undefined,
    });
  });

  // A failing tracker answers 200 with Results: [] and its message on the row —
  // and must resolve as a verdict here, not throw the way a user search does.
  it("reports the tracker's own error instead of throwing", async () => {
    mockRequest.mockResolvedValue({
      Results: [],
      Indexers: [row({ Results: 0, Error: "Login failed: invalid cookie" })],
    });
    await expect(testIndexer("1337x")).resolves.toEqual({
      ok: false,
      results: 0,
      elapsedMs: 340,
      error: "Login failed: invalid cookie",
    });
  });

  // Jackett's own test throws on an empty browse, so a clean-but-empty response
  // is a failure, not a pass.
  it("fails a browse that came back with nothing", async () => {
    mockRequest.mockResolvedValue({
      Results: [],
      Indexers: [row({ Results: 0 })],
    });
    await expect(testIndexer("1337x")).resolves.toMatchObject({
      ok: false,
      results: 0,
      error: "Found no results while browsing this tracker",
    });
  });

  // Older builds echo the row under a differently-cased id; the sole row is
  // still the one that was queried.
  it("falls back to the only row when the id doesn't match", async () => {
    mockRequest.mockResolvedValue({
      Results: [],
      Indexers: [row({ ID: "1337X" })],
    });
    await expect(testIndexer("1337x")).resolves.toMatchObject({ ok: true, results: 12 });
  });
});

function response(
  results: number,
  indexers: Array<{ Name: string; Error: string | null }>,
): JackettResultsResponse {
  return {
    Results: Array.from({ length: results }, (_, i) => ({
      Guid: `g${i}`,
      Title: `Release ${i}`,
      Tracker: "1337x",
      TrackerId: "1337x",
      CategoryDesc: null,
      PublishDate: "2026-01-01T00:00:00Z",
      Size: 1,
      Seeders: 1,
      Peers: 0,
      Grabs: null,
      Link: null,
      MagnetUri: "magnet:?xt=1",
      Details: null,
    })),
    Indexers: indexers.map((i, n) => ({
      ID: `id${n}`,
      Name: i.Name,
      Status: i.Error ? 1 : 0,
      Results: 0,
      Error: i.Error,
    })),
  };
}

describe("assertIndexersUsable", () => {
  // A search where every tracker errored decodes as `Results: []`, which the UI
  // otherwise renders as a plain "No results" (#314).
  it("throws when there are no results and every indexer errored", () => {
    const resp = response(0, [
      { Name: "1337x", Error: "Connection timed out" },
      { Name: "Nyaa", Error: "403 Forbidden" },
    ]);
    expect(() => assertIndexersUsable(resp)).toThrow(
      "2 of 2 indexers failed. 1337x: Connection timed out",
    );
  });

  // A partial failure still has something to show, so it must not become an
  // error banner that hides the working trackers' releases.
  it("stays silent when some indexers errored but results came back", () => {
    const resp = response(3, [
      { Name: "1337x", Error: null },
      { Name: "Nyaa", Error: "403 Forbidden" },
    ]);
    expect(() => assertIndexersUsable(resp)).not.toThrow();
  });

  it("stays silent on a genuine no-match", () => {
    const resp = response(0, [
      { Name: "1337x", Error: null },
      { Name: "Nyaa", Error: null },
    ]);
    expect(() => assertIndexersUsable(resp)).not.toThrow();
  });

  it("tolerates a response with no Indexers array", () => {
    expect(() =>
      assertIndexersUsable({ Results: [] } as unknown as JackettResultsResponse),
    ).not.toThrow();
  });
});
