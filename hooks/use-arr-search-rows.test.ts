// Mock native storage before importing — use-arr-search-rows pulls in the *arr
// hooks → services → config-store → AsyncStorage/SecureStore at module load.
// The functions under test are pure. Same shims as the other unit tests.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import {
  LIDARR_SEARCH_ADAPTER,
  RADARR_SEARCH_ADAPTER,
  SONARR_SEARCH_ADAPTER,
  buildSearchRows,
  isLookupPending,
} from "./use-arr-search-rows";
import type {
  LidarrArtist,
  RadarrMovie,
  RadarrSearchResult,
  SonarrSeries,
} from "@/lib/types";

// The real entities carry dozens of fields the adapters never read.
function movie(over: Partial<RadarrMovie>): RadarrMovie {
  return { id: 1, tmdbId: 100, title: "Dune", images: [], ...over } as RadarrMovie;
}
function series(over: Partial<SonarrSeries>): SonarrSeries {
  return {
    id: 1,
    tvdbId: 200,
    title: "The Office",
    network: "NBC",
    images: [],
    ...over,
  } as SonarrSeries;
}
function artist(over: Partial<LidarrArtist>): LidarrArtist {
  return {
    id: 1,
    foreignArtistId: "mb-1",
    artistName: "Radiohead",
    images: [],
    ...over,
  } as LidarrArtist;
}

describe("RADARR_SEARCH_ADAPTER", () => {
  it("matches on title, sortTitle and year", () => {
    expect(
      RADARR_SEARCH_ADAPTER.fields(
        movie({ title: "The Thing", sortTitle: "thing", year: 1982 }),
      ),
    ).toEqual({ title: "The Thing", sortTitle: "thing", year: 1982 });
  });

  it("keys the library by tmdbId and exposes the library id separately", () => {
    const m = movie({ id: 7, tmdbId: 438 });
    expect(RADARR_SEARCH_ADAPTER.libraryKey(m)).toBe(438);
    expect(RADARR_SEARCH_ADAPTER.libraryId(m)).toBe(7);
    expect(
      RADARR_SEARCH_ADAPTER.lookupKey({ tmdbId: 438 } as RadarrSearchResult),
    ).toBe(438);
  });

  it("builds the same meta line as the lookup row", () => {
    expect(
      RADARR_SEARCH_ADAPTER.display(
        movie({ year: 2021, collection: { title: "Dune Collection", tmdbId: 9 } }),
      ).metaLine,
    ).toBe("2021 · Part of Dune Collection");
    expect(RADARR_SEARCH_ADAPTER.display(movie({ year: 2021 })).metaLine).toBe("2021");
    expect(RADARR_SEARCH_ADAPTER.display(movie({})).metaLine).toBeUndefined();
  });

  it("picks the poster image and tolerates a missing images array", () => {
    const poster = { coverType: "poster", url: "/p.jpg", remoteUrl: "http://x/p.jpg" };
    const fanart = { coverType: "fanart", url: "/f.jpg", remoteUrl: "http://x/f.jpg" };
    expect(
      RADARR_SEARCH_ADAPTER.display(
        movie({ images: [fanart, poster] as RadarrMovie["images"] }),
      ).poster,
    ).toBe(poster);
    expect(
      RADARR_SEARCH_ADAPTER.display(
        movie({ images: undefined as unknown as RadarrMovie["images"] }),
      ).poster,
    ).toBeUndefined();
  });
});

describe("SONARR_SEARCH_ADAPTER", () => {
  it("keys the library by tvdbId", () => {
    const s = series({ id: 4, tvdbId: 121361 });
    expect(SONARR_SEARCH_ADAPTER.libraryKey(s)).toBe(121361);
    expect(SONARR_SEARCH_ADAPTER.libraryId(s)).toBe(4);
  });

  it("prefers statistics.seasonCount over the top-level field", () => {
    const s = series({
      year: 2005,
      seasonCount: 2,
      statistics: { seasonCount: 9 } as SonarrSeries["statistics"],
    });
    expect(SONARR_SEARCH_ADAPTER.display(s).metaLine).toBe("2005 · NBC · 9 seasons");
  });

  it("singularizes a one-season show", () => {
    expect(
      SONARR_SEARCH_ADAPTER.display(series({ year: 2019, seasonCount: 1 })).metaLine,
    ).toBe("2019 · NBC · 1 season");
  });

  it("drops the parts it has no data for", () => {
    expect(
      SONARR_SEARCH_ADAPTER.display(
        series({ network: "", seasonCount: 0 }),
      ).metaLine,
    ).toBeUndefined();
  });
});

describe("LIDARR_SEARCH_ADAPTER", () => {
  it("maps artistName/sortName onto the shared title fields", () => {
    expect(
      LIDARR_SEARCH_ADAPTER.fields(
        artist({ artistName: "The Beatles", sortName: "Beatles, The" }),
      ),
    ).toEqual({ title: "The Beatles", sortTitle: "Beatles, The" });
  });

  it("keys the library by foreignArtistId (a string, not a number)", () => {
    const a = artist({ id: 3, foreignArtistId: "a74b1b7f" });
    expect(LIDARR_SEARCH_ADAPTER.libraryKey(a)).toBe("a74b1b7f");
    expect(LIDARR_SEARCH_ADAPTER.libraryId(a)).toBe(3);
  });

  it("builds the type · disambiguation meta line", () => {
    expect(
      LIDARR_SEARCH_ADAPTER.display(
        artist({ artistType: "Group", disambiguation: "UK rock band" }),
      ).metaLine,
    ).toBe("Group · UK rock band");
    expect(LIDARR_SEARCH_ADAPTER.display(artist({})).metaLine).toBeUndefined();
  });
});

describe("buildSearchRows", () => {
  const existing = new Map<number, number>([[438, 7]]);

  it("namespaces the keys so a library and lookup row can't collide (#304)", () => {
    const rows = buildSearchRows(
      [movie({ id: 7, tmdbId: 438 })],
      [{ tmdbId: 999 } as RadarrSearchResult],
      existing,
      RADARR_SEARCH_ADAPTER,
    );
    expect(rows.map((r) => r.key)).toEqual(["lib:438", "new:999"]);
  });

  it("carries the library id onto a library row for the detail push", () => {
    const [row] = buildSearchRows(
      [movie({ id: 7, tmdbId: 438 })],
      undefined,
      existing,
      RADARR_SEARCH_ADAPTER,
    );
    expect(row).toMatchObject({ kind: "library", id: 7 });
  });

  it("marks a lookup result that is already in the library", () => {
    // 438 is in `existing` but was not promoted (no local text match), so it
    // stays a lookup row and must still show as added.
    const rows = buildSearchRows(
      [],
      [{ tmdbId: 438 } as RadarrSearchResult, { tmdbId: 999 } as RadarrSearchResult],
      existing,
      RADARR_SEARCH_ADAPTER,
    );
    expect(rows.map((r) => (r.kind === "lookup" ? r.existingId : null))).toEqual([
      7,
      undefined,
    ]);
  });

  it("works with the string-keyed Lidarr adapter", () => {
    const rows = buildSearchRows(
      [artist({ id: 3, foreignArtistId: "a74b" })],
      undefined,
      new Map<string, number>(),
      LIDARR_SEARCH_ADAPTER,
    );
    expect(rows[0].key).toBe("lib:a74b");
  });
});

describe("isLookupPending", () => {
  it("is false below the two-character minimum", () => {
    expect(isLookupPending("d", "d", true)).toBe(false);
    expect(isLookupPending("", "", false)).toBe(false);
  });

  it("is true while the lookup is fetching", () => {
    expect(isLookupPending("dune", "dune", true)).toBe(true);
  });

  it("is true while the debounce has not caught up, so the empty state can't flash", () => {
    expect(isLookupPending("dune", "dun", false)).toBe(true);
  });

  it("is false once the term settled and the fetch finished", () => {
    expect(isLookupPending("dune", "dune", false)).toBe(false);
  });
});
