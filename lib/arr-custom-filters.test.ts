import { applyArrCustomFilter } from "@/lib/arr-custom-filters";
import type { ArrCustomFilter, ArrFilterClause, ArrRelease } from "@/lib/types";

function release(over: Partial<ArrRelease>): ArrRelease {
  return {
    guid: "g",
    indexerId: 1,
    indexer: "Indexer",
    title: "Some.Release.1080p.WEB-DL",
    size: 1_000_000_000,
    age: 5,
    ageHours: 120,
    publishDate: "2024-01-01T00:00:00Z",
    quality: { quality: { id: 7, name: "1080p" } },
    protocol: "torrent",
    rejected: false,
    ...over,
  } as ArrRelease;
}

function filter(filters: ArrFilterClause[]): ArrCustomFilter {
  return { id: 1, type: "releases", label: "Test", filters };
}

describe("applyArrCustomFilter", () => {
  it("empty filters passes everything through", () => {
    const list = [release({ guid: "a" }), release({ guid: "b" })];
    expect(applyArrCustomFilter(list, filter([])).length).toBe(2);
  });

  it("quality equal matches by id (number value)", () => {
    const list = [
      release({ guid: "hd", quality: { quality: { id: 7, name: "1080p" } } }),
      release({ guid: "uhd", quality: { quality: { id: 9, name: "2160p" } } }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "quality", value: [7], type: "equal" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["hd"]);
  });

  it("quality equal tolerates a string-serialized value", () => {
    const list = [release({ guid: "hd", quality: { quality: { id: 7, name: "1080p" } } })];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "quality", value: ["7"], type: "equal" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["hd"]);
  });

  it("protocol equal filters by string", () => {
    const list = [
      release({ guid: "t", protocol: "torrent" }),
      release({ guid: "u", protocol: "usenet" }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "protocol", value: ["torrent"], type: "equal" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["t"]);
  });

  it("seeders greaterThan; usenet release with no seeders defaults to 0", () => {
    const list = [
      release({ guid: "lots", protocol: "torrent", seeders: 50 }),
      release({ guid: "few", protocol: "torrent", seeders: 2 }),
      release({ guid: "usenet", protocol: "usenet" }), // no seeders key
    ];
    const gt5 = applyArrCustomFilter(
      list,
      filter([{ key: "seeders", value: 5, type: "greaterThan" }]),
    );
    expect(gt5.map((r) => r.guid)).toEqual(["lots"]);

    const gte0 = applyArrCustomFilter(
      list,
      filter([{ key: "seeders", value: 0, type: "greaterThanOrEqual" }]),
    );
    expect(gte0.map((r) => r.guid)).toEqual(["lots", "few", "usenet"]);
  });

  it("peers = seeders + leechers", () => {
    const list = [
      release({ guid: "a", seeders: 10, leechers: 5 }), // 15
      release({ guid: "b", seeders: 1, leechers: 1 }), // 2
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "peers", value: 10, type: "greaterThan" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["a"]);
  });

  it("languages contains by name", () => {
    const list = [
      release({ guid: "en", languages: [{ id: 1, name: "English" }] }),
      release({ guid: "fr", languages: [{ id: 2, name: "French" }] }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "languages", value: ["English"], type: "contains" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["en"]);
  });

  it("rejectionCount equal 0 keeps only clean releases", () => {
    const list = [
      release({ guid: "clean", rejected: false, rejections: [] }),
      release({ guid: "bad", rejected: true, rejections: ["too small"] }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "rejectionCount", value: 0, type: "equal" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["clean"]);
  });

  it("size greaterThan in bytes", () => {
    const list = [
      release({ guid: "big", size: 5_000_000_000 }),
      release({ guid: "small", size: 500_000_000 }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "size", value: 1_000_000_000, type: "greaterThan" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["big"]);
  });

  it("multiple clauses combine with AND", () => {
    const list = [
      release({ guid: "ok", protocol: "torrent", seeders: 20 }),
      release({ guid: "noseed", protocol: "torrent", seeders: 1 }),
      release({ guid: "usenet", protocol: "usenet", seeders: 99 }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([
        { key: "protocol", value: ["torrent"], type: "equal" },
        { key: "seeders", value: 5, type: "greaterThan" },
      ]),
    );
    expect(out.map((r) => r.guid)).toEqual(["ok"]);
  });

  it("array notEqual uses .every (excludes if value matches any)", () => {
    const list = [
      release({ guid: "hd", quality: { quality: { id: 7, name: "1080p" } } }),
      release({ guid: "sd", quality: { quality: { id: 1, name: "SD" } } }),
    ];
    // notEqual to [7, 1] → exclude id 7 AND id 1 → both dropped
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "quality", value: [7, 1], type: "notEqual" }]),
    );
    expect(out.length).toBe(0);

    // notEqual to [1] → keep id 7
    const out2 = applyArrCustomFilter(
      list,
      filter([{ key: "quality", value: [1], type: "notEqual" }]),
    );
    expect(out2.map((r) => r.guid)).toEqual(["hd"]);
  });

  it("title contains is case-insensitive substring", () => {
    const list = [
      release({ guid: "web", title: "Movie.1080p.WEB-DL.x265" }),
      release({ guid: "bluray", title: "Movie.1080p.BluRay.x265" }),
    ];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "title", value: "web-dl", type: "contains" }]),
    );
    expect(out.map((r) => r.guid)).toEqual(["web"]);
  });

  it("a malformed clause rejects only its own row, never throws", () => {
    const list = [release({ guid: "a" })];
    const bad = filter([{ key: "quality", value: 7, type: "bogusOperator" }]);
    expect(() => applyArrCustomFilter(list, bad)).not.toThrow();
    expect(applyArrCustomFilter(list, bad).length).toBe(0);
  });

  it("unknown column rejects everything (matches *arr fallthrough)", () => {
    const list = [release({ guid: "a" })];
    const out = applyArrCustomFilter(
      list,
      filter([{ key: "nonexistentField", value: "x", type: "equal" }]),
    );
    expect(out.length).toBe(0);
  });
});
