// Mock the http client entirely — jackett-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { getIndexers, parseIndexersXml, searchAll } from "@/services/jackett-api";

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
      instanceId: "inst-2",
    });
  });
});
