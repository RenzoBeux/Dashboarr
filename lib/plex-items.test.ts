import { getDemoPlexResponse } from "@/lib/demo-data";
import {
  plexAppUrl,
  plexBackdropPath,
  plexChildSubtitle,
  plexHasChildren,
  plexIsWatched,
  plexLibraryNextOffset,
  plexMetaLine,
  plexPosterPath,
  plexResolutionLabel,
  plexWebUrl,
} from "@/lib/plex-items";
import type { PlexMediaContainer, PlexMediaItem } from "@/lib/types";

const item = (overrides: Partial<PlexMediaItem>): PlexMediaItem => ({
  ratingKey: "1",
  key: "/library/metadata/1",
  type: "movie",
  title: "Title",
  addedAt: 0,
  ...overrides,
});

describe("plexHasChildren", () => {
  it("treats shows, seasons, artists and albums as containers", () => {
    for (const type of ["show", "season", "artist", "album"] as const) {
      expect(plexHasChildren(item({ type }))).toBe(true);
    }
  });

  it("treats movies, episodes and tracks as leaves", () => {
    for (const type of ["movie", "episode", "track"] as const) {
      expect(plexHasChildren(item({ type }))).toBe(false);
    }
  });

  it("follows a /children key for types it doesn't know", () => {
    expect(plexHasChildren(item({ type: "photo", key: "/library/metadata/9/children" }))).toBe(true);
    expect(plexHasChildren(item({ type: "photo", key: "/library/metadata/9" }))).toBe(false);
  });
});

describe("artwork", () => {
  it("gives an episode its season poster and its own still as backdrop", () => {
    const episode = item({
      type: "episode",
      thumb: "/still",
      parentThumb: "/season",
      grandparentThumb: "/show",
      art: "/show-art",
    });
    expect(plexPosterPath(episode)).toBe("/season");
    expect(plexBackdropPath(episode)).toBe("/still");
  });

  it("uses a movie's own poster and art", () => {
    const movie = item({ thumb: "/poster", art: "/art" });
    expect(plexPosterPath(movie)).toBe("/poster");
    expect(plexBackdropPath(movie)).toBe("/art");
  });

  it("returns undefined for empty paths", () => {
    expect(plexPosterPath(item({ thumb: "" }))).toBeUndefined();
    expect(plexBackdropPath(item({ art: "" }))).toBeUndefined();
  });
});

describe("plexResolutionLabel", () => {
  it.each([
    ["4k", "4K"],
    ["1080", "1080p"],
    ["720", "720p"],
    ["sd", "SD"],
    [undefined, undefined],
  ])("%s -> %s", (input, expected) => {
    expect(plexResolutionLabel(input)).toBe(expected);
  });
});

describe("plexMetaLine", () => {
  it("formats a movie as year and runtime", () => {
    expect(plexMetaLine(item({ year: 2024, duration: 9960000 }))).toBe("2024 · 2h 46m");
  });

  it("formats an episode as show, code and runtime", () => {
    expect(
      plexMetaLine(
        item({
          type: "episode",
          grandparentTitle: "Fallout",
          parentIndex: 1,
          index: 5,
          duration: 3720000,
        }),
      ),
    ).toBe("Fallout · S01E05 · 1h 2m");
  });

  it("pluralizes season and episode counts", () => {
    expect(plexMetaLine(item({ type: "show", year: 2024, childCount: 1 }))).toBe("2024 · 1 season");
    expect(plexMetaLine(item({ type: "season", parentTitle: "Fallout", leafCount: 8 }))).toBe(
      "Fallout · 8 episodes",
    );
  });

  it("skips missing parts instead of printing empty separators", () => {
    expect(plexMetaLine(item({}))).toBe("");
  });
});

describe("plexChildSubtitle", () => {
  it("shows partial progress on a season, not a finished one", () => {
    expect(plexChildSubtitle(item({ type: "season", leafCount: 8, viewedLeafCount: 3 }))).toBe(
      "8 episodes · 3 watched",
    );
    expect(plexChildSubtitle(item({ type: "season", leafCount: 8, viewedLeafCount: 8 }))).toBe(
      "8 episodes",
    );
  });
});

describe("plexIsWatched", () => {
  it("needs every episode played for a container", () => {
    expect(plexIsWatched(item({ type: "season", leafCount: 8, viewedLeafCount: 8 }))).toBe(true);
    expect(plexIsWatched(item({ type: "season", leafCount: 8, viewedLeafCount: 7 }))).toBe(false);
    expect(plexIsWatched(item({ type: "season", leafCount: 0, viewedLeafCount: 0 }))).toBe(false);
  });

  it("uses the play count for a leaf", () => {
    expect(plexIsWatched(item({ viewCount: 1 }))).toBe(true);
    expect(plexIsWatched(item({}))).toBe(false);
  });
});

describe("plexLibraryNextOffset", () => {
  const page = (n: number, totalSize: number) => ({ items: Array.from({ length: n }), totalSize });

  it("asks for the next offset until the total is loaded", () => {
    const first = page(60, 130);
    expect(plexLibraryNextOffset(first, [first])).toBe(60);
    const second = page(60, 130);
    expect(plexLibraryNextOffset(second, [first, second])).toBe(120);
    const third = page(10, 130);
    expect(plexLibraryNextOffset(third, [first, second, third])).toBeUndefined();
  });

  it("stops on an empty page even if the total says more", () => {
    const first = page(60, 130);
    const empty = page(0, 130);
    expect(plexLibraryNextOffset(empty, [first, empty])).toBeUndefined();
  });
});

describe("Plex deep links", () => {
  it("matches the app and web link formats Overseerr uses", () => {
    expect(plexAppUrl("abc123", "42")).toBe(
      "plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F42&server=abc123",
    );
    expect(plexWebUrl("abc123", "42")).toBe(
      "https://app.plex.tv/desktop#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F42",
    );
  });
});

describe("Plex demo catalog", () => {
  const demo = (path: string) => getDemoPlexResponse(path) as PlexMediaContainer<PlexMediaItem>;

  it("answers each library with its own items, on one page", () => {
    const movies = demo("/library/sections/1/all?X-Plex-Container-Start=0&X-Plex-Container-Size=60");
    expect(movies.MediaContainer.Metadata!.every((i) => i.type === "movie")).toBe(true);
    expect(movies.MediaContainer.totalSize).toBe(movies.MediaContainer.Metadata!.length);
    const next = demo("/library/sections/1/all?X-Plex-Container-Start=60&X-Plex-Container-Size=60");
    expect(next.MediaContainer.Metadata).toEqual([]);
  });

  it("walks show -> season -> episode by ratingKey", () => {
    const shows = demo("/library/sections/2/all?X-Plex-Container-Start=0").MediaContainer.Metadata!;
    const show = shows[0]!;
    expect(show.type).toBe("show");
    const seasons = demo(`/library/metadata/${show.ratingKey}/children`).MediaContainer.Metadata!;
    expect(seasons[0]!.type).toBe("season");
    const episodes = demo(`/library/metadata/${seasons[0]!.ratingKey}/children`).MediaContainer
      .Metadata!;
    expect(episodes.length).toBeGreaterThan(0);
    const episode = demo(`/library/metadata/${episodes[0]!.ratingKey}`).MediaContainer.Metadata![0]!;
    expect(episode.ratingKey).toBe(episodes[0]!.ratingKey);
    expect(episode.grandparentRatingKey).toBe(show.ratingKey);
  });

  it("resolves every Recently Added item to its own metadata", () => {
    const recent = demo("/library/recentlyAdded").MediaContainer.Metadata!;
    for (const entry of recent) {
      const resolved = demo(`/library/metadata/${entry.ratingKey}`).MediaContainer.Metadata![0];
      expect(resolved?.ratingKey).toBe(entry.ratingKey);
    }
  });

  it("reports a machine identifier for Open in Plex", () => {
    const identity = getDemoPlexResponse("/identity") as {
      MediaContainer: { machineIdentifier?: string };
    };
    expect(identity.MediaContainer.machineIdentifier).toBeTruthy();
  });
});
