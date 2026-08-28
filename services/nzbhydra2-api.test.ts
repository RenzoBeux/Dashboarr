// Mock the http client entirely — nzbhydra2-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));

// The four POST endpoints have to put the key in the JSON BODY as well (since
// v7.15.3 they bind @RequestBody, so the query param http-client injects is
// ignored), which means this module reads the secret itself.
jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => ({
      getActiveInstanceId: () => "inst-active",
      instanceSecrets: {
        "inst-active": { apiKey: "active-key" },
        "inst-1": { apiKey: "key-1" },
      },
    }),
  },
}));

import { serviceRequest } from "@/lib/http-client";
import {
  buildHistoryRequest,
  getCaps,
  getDownloadHistory,
  getIndexerStatuses,
  getSearchHistory,
  getStats,
  parseCapsResponse,
  parseSearchResponse,
  searchNzbhydra2,
} from "@/services/nzbhydra2-api";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

/** The (serviceId, path, options) triple of the Nth serviceRequest call. */
function call(n = 0) {
  const [serviceId, path, options] = mockRequest.mock.calls[n];
  return { serviceId, path, options };
}

describe("getCaps", () => {
  it("asks the newznab mount for JSON caps", async () => {
    mockRequest.mockResolvedValue({ server: { "@attributes": { appversion: "8.9.0" } } });
    await getCaps("inst-1");
    const { serviceId, path, options } = call();
    expect(serviceId).toBe("nzbhydra2");
    // apiBasePath is "", so the /api prefix is spelled by this module.
    expect(path).toBe("/api");
    // `o` defaults to XML upstream — omitting o=json would return XML.
    expect(options.params).toEqual({ t: "caps", o: "json" });
    expect(options.instanceId).toBe("inst-1");
  });

  it("does not send the apikey itself — http-client injects it as a query param", async () => {
    mockRequest.mockResolvedValue({ server: {} });
    await getCaps();
    expect(call().options.params).not.toHaveProperty("apikey");
  });
});

describe("parseCapsResponse", () => {
  it.each([
    ["the JVM build's @attributes", { server: { "@attributes": { appversion: "8.9.0" } } }],
    ["the native build's attributes", { server: { attributes: { appversion: "8.9.0" } } }],
  ])("returns caps when `server` is present, with %s", (_label, caps) => {
    expect(parseCapsResponse(caps)).toBe(caps);
  });

  it("throws on the wrong-key envelope, which arrives as HTTP 200", () => {
    expect(() => parseCapsResponse({ code: "100", description: "Wrong api key" })).toThrow(
      "Wrong api key (code 100)",
    );
  });

  it("throws on the XML error the mount can answer with despite o=json", () => {
    expect(() =>
      parseCapsResponse('<?xml version="1.0"?><error code="100" description="Wrong api key"/>'),
    ).toThrow("Wrong api key (code 100)");
  });

  it("parses a JSON body delivered as a string", () => {
    expect(parseCapsResponse('{"server":{"@attributes":{"appversion":"8.9.0"}}}')).toEqual({
      server: { "@attributes": { appversion: "8.9.0" } },
    });
  });

  it("explains an HTML body rather than throwing a JSON parse error", () => {
    expect(() => parseCapsResponse("<!doctype html><html>login</html>")).toThrow(
      /non-JSON response/,
    );
  });
});

describe("getIndexerStatuses", () => {
  it("POSTs the key in the body — @RequestBody ignores the query param", async () => {
    await getIndexerStatuses("inst-1");
    const { path, options } = call();
    expect(path).toBe("/api/stats/indexers");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ apikey: "key-1" });
  });

  it("falls back to the active instance's key", async () => {
    await getIndexerStatuses();
    expect(JSON.parse(call().options.body)).toEqual({ apikey: "active-key" });
  });
});

describe("getStats", () => {
  it("sends an explicit request object — omitting it turns nearly every flag on", async () => {
    const request = {
      includeDisabled: true,
      indexerApiAccessStats: true,
      avgResponseTimes: true,
      after: "2026-01-01T00:00:00.000Z",
      before: "2026-01-31T00:00:00.000Z",
    };
    await getStats(request, "inst-1");
    const { path, options } = call();
    expect(path).toBe("/api/stats");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ apikey: "key-1", request });
  });

  it("raises the timeout past the 30s ceiling upstream aborts at", async () => {
    await getStats({}, "inst-1");
    expect(call().options.timeout).toBeGreaterThan(30_000);
  });
});

describe("buildHistoryRequest", () => {
  it("always emits a sortModel — omitting it NPEs upstream into a 500", () => {
    expect(buildHistoryRequest().sortModel).toEqual({ column: "time", sortMode: 2 });
  });

  it("uses ONE-based paging, unlike the zero-based `number` it gets back", () => {
    expect(buildHistoryRequest().page).toBe(1);
    expect(buildHistoryRequest({ page: 3 }).page).toBe(3);
  });

  it("maps descending:false to sortMode 1 (the only ASC value upstream honours)", () => {
    expect(buildHistoryRequest({ column: "title", descending: false }).sortModel).toEqual({
      column: "title",
      sortMode: 1,
    });
  });

  it("maps descending:true to sortMode 2", () => {
    expect(buildHistoryRequest({ descending: true }).sortModel.sortMode).toBe(2);
  });
});

describe("history endpoints", () => {
  it.each([
    ["searches", getSearchHistory, "/api/history/searches"],
    ["downloads", getDownloadHistory, "/api/history/downloads"],
  ])("POSTs %s with the key and a sortModel", async (_label, fn, path) => {
    const request = buildHistoryRequest({ page: 2 });
    await (fn as typeof getSearchHistory)(request, "inst-1");
    const c = call();
    expect(c.path).toBe(path);
    expect(c.options.method).toBe("POST");
    const body = JSON.parse(c.options.body);
    expect(body.apikey).toBe("key-1");
    expect(body.request.sortModel).toBeDefined();
    expect(body.request.page).toBe(2);
  });
});

describe("searchNzbhydra2", () => {
  it("sends a newznab free-text search as JSON", async () => {
    mockRequest.mockResolvedValue({ channel: { item: [] } });
    await searchNzbhydra2({ query: "the expanse" }, "inst-1");
    const { path, options } = call();
    expect(path).toBe("/api");
    expect(options.params).toEqual({ t: "search", o: "json", q: "the expanse", limit: 100 });
    expect(options.instanceId).toBe("inst-1");
  });

  it("scopes to an indexer by NAME — `indexers=` does not take ids", async () => {
    mockRequest.mockResolvedValue({ channel: { item: [] } });
    await searchNzbhydra2({ query: "x", indexers: ["NZBGeek", "DrunkenSlug"] });
    expect(call().options.params.indexers).toBe("NZBGeek,DrunkenSlug");
  });

  it("omits indexers and cat when unset", async () => {
    mockRequest.mockResolvedValue({ channel: { item: [] } });
    await searchNzbhydra2({ query: "x" });
    const params = call().options.params;
    expect("indexers" in params).toBe(false);
    expect("cat" in params).toBe(false);
    // cachetime would make Hydra serve a cached answer to a deliberate
    // re-search, so it is never sent.
    expect("cachetime" in params).toBe(false);
  });

  it("uses the interactive-search timeout and forwards the abort signal", async () => {
    mockRequest.mockResolvedValue({ channel: { item: [] } });
    const controller = new AbortController();
    await searchNzbhydra2({ query: "x" }, undefined, controller.signal);
    const { options } = call();
    expect(options.timeout).toBe(90_000);
    expect(options.signal).toBe(controller.signal);
  });
});

describe("parseSearchResponse", () => {
  it("returns the item array", () => {
    const items = [{ title: "a" }, { title: "b" }];
    expect(parseSearchResponse({ channel: { item: items } })).toEqual(items);
  });

  it("wraps a single item Jackson collapsed to a bare object", () => {
    expect(parseSearchResponse({ channel: { item: { title: "only" } } })).toEqual([
      { title: "only" },
    ]);
  });

  it("returns [] when the channel carries no items", () => {
    expect(parseSearchResponse({ channel: {} })).toEqual([]);
  });

  it("treats a body with `channel` as success even if it also carries a code", () => {
    // Guards the ordering: `channel` wins, so a future field named `code` on a
    // good response can't be misread as a failure.
    expect(parseSearchResponse({ channel: { item: [] }, code: "0" })).toEqual([]);
  });

  it("throws the newznab error that arrives as HTTP 200", () => {
    expect(() => parseSearchResponse({ code: "100", description: "Wrong api key" })).toThrow(
      "Wrong api key (code 100)",
    );
  });

  it("throws on the XML error variant", () => {
    expect(() => parseSearchResponse('<error code="100" description="Wrong api key"/>')).toThrow(
      "Wrong api key (code 100)",
    );
  });

  it("throws on an empty body rather than reporting zero results", () => {
    expect(() => parseSearchResponse(undefined)).toThrow(/empty response/);
  });
});
