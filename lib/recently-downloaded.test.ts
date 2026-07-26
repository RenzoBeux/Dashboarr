import { groupRecentDownloads, type RecentItem } from "./recently-downloaded";

// Import records carry far more than the grouper reads; these factories keep
// the fixtures to the fields that actually decide a group.
function episode(
  id: number,
  date: string,
  seriesId: number | undefined,
  instanceId = "sonarr-a",
  episodeId?: number,
): RecentItem {
  return {
    kind: "episode",
    instanceId,
    date,
    record: {
      id,
      eventType: "downloadFolderImported",
      date,
      ...(seriesId === undefined ? {} : { seriesId }),
      ...(episodeId === undefined ? {} : { episodeId }),
    },
  };
}

function movie(id: number, date: string, instanceId = "radarr-a"): RecentItem {
  return {
    kind: "movie",
    instanceId,
    date,
    record: { id, eventType: "downloadFolderImported", date },
  };
}

describe("groupRecentDownloads", () => {
  it("sorts newest first", () => {
    const groups = groupRecentDownloads(
      [
        movie(1, "2026-07-20T10:00:00Z"),
        movie(2, "2026-07-24T10:00:00Z"),
        movie(3, "2026-07-22T10:00:00Z"),
      ],
      true,
    );
    expect(groups.map((g) => g.items[0].record.id)).toEqual([2, 3, 1]);
  });

  // The point of issue #307: a batch of episodes must occupy one slot, not
  // three, so the rest of the feed stays visible.
  it("collapses several imports of the same series into one group", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", 5),
        episode(11, "2026-07-24T11:00:00Z", 5),
        episode(12, "2026-07-24T12:00:00Z", 5),
      ],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.record.id)).toEqual([12, 11, 10]);
    expect(groups[0].date).toBe("2026-07-24T12:00:00Z");
    expect(groups[0].key).toBe("series:sonarr-a:5");
  });

  // Grouping collapses follow-ups into the tile that was already there; it
  // never promotes a series ahead of a newer unrelated import.
  it("keeps a group at the feed position of its newest episode", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-20T10:00:00Z", 5),
        movie(20, "2026-07-22T10:00:00Z"),
        episode(11, "2026-07-24T10:00:00Z", 5),
      ],
      true,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "series:sonarr-a:5",
      "movie:radarr-a:20",
    ]);
    expect(groups[0].items).toHaveLength(2);
  });

  // A quality upgrade re-imports an episode already in the window. Counting
  // both would badge one episode as "2 episodes" and list it twice.
  it("keeps only the newest import of a repeated episode", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-20T10:00:00Z", 5, "sonarr-a", 900),
        episode(11, "2026-07-24T10:00:00Z", 5, "sonarr-a", 900),
        episode(12, "2026-07-22T10:00:00Z", 5, "sonarr-a", 901),
      ],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.record.id)).toEqual([11, 12]);
  });

  it("does not dedupe the same episode id across different series", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", 5, "sonarr-a", 900),
        episode(11, "2026-07-24T11:00:00Z", 6, "sonarr-a", 900),
      ],
      true,
    );
    expect(groups).toHaveLength(2);
  });

  // Nothing to match on, so a duplicate is preferable to a dropped import.
  it("keeps repeated imports when the episode id is missing", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-20T10:00:00Z", 5),
        episode(11, "2026-07-24T10:00:00Z", 5),
      ],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("leaves repeated episodes alone when grouping is off", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-20T10:00:00Z", 5, "sonarr-a", 900),
        episode(11, "2026-07-24T10:00:00Z", 5, "sonarr-a", 900),
      ],
      false,
    );
    expect(groups).toHaveLength(2);
  });

  it("keeps different series apart", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", 5),
        episode(11, "2026-07-24T11:00:00Z", 6),
      ],
      true,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "series:sonarr-a:6",
      "series:sonarr-a:5",
    ]);
  });

  // Series ids are only unique within an instance, so two Sonarrs sharing an
  // id are still two different shows.
  it("keeps the same series id on different instances apart", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", 5, "sonarr-a"),
        episode(11, "2026-07-24T11:00:00Z", 5, "sonarr-b"),
      ],
      true,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key)).toEqual([
      "series:sonarr-b:5",
      "series:sonarr-a:5",
    ]);
  });

  it("never groups movies, even two imports of the same movie", () => {
    const groups = groupRecentDownloads(
      [movie(20, "2026-07-24T10:00:00Z"), movie(21, "2026-07-24T11:00:00Z")],
      true,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key)).toEqual([
      "movie:radarr-a:21",
      "movie:radarr-a:20",
    ]);
  });

  it("falls back to the embedded series id when the record omits the top-level one", () => {
    const withEmbedded: RecentItem = {
      kind: "episode",
      instanceId: "sonarr-a",
      date: "2026-07-24T11:00:00Z",
      record: {
        id: 11,
        eventType: "downloadFolderImported",
        date: "2026-07-24T11:00:00Z",
        series: { id: 5 } as never,
      },
    };
    const groups = groupRecentDownloads(
      [episode(10, "2026-07-24T10:00:00Z", 5), withEmbedded],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  // Nothing to group on — but the tile still has to render, so it becomes its
  // own group rather than being dropped or merged with other unknowns.
  it("gives every series-less episode its own group", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", undefined),
        episode(11, "2026-07-24T11:00:00Z", undefined),
      ],
      true,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key)).toEqual([
      "episode:sonarr-a:11",
      "episode:sonarr-a:10",
    ]);
  });

  it("leaves every import in its own group when grouping is off", () => {
    const groups = groupRecentDownloads(
      [
        episode(10, "2026-07-24T10:00:00Z", 5),
        episode(11, "2026-07-24T11:00:00Z", 5),
        episode(12, "2026-07-24T12:00:00Z", 5),
      ],
      false,
    );
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.items[0].record.id)).toEqual([12, 11, 10]);
    expect(groups.map((g) => g.key)).toEqual([
      "episode:sonarr-a:12",
      "episode:sonarr-a:11",
      "episode:sonarr-a:10",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [
      movie(1, "2026-07-20T10:00:00Z"),
      movie(2, "2026-07-24T10:00:00Z"),
    ];
    groupRecentDownloads(items, true);
    expect(items.map((i) => i.record.id)).toEqual([1, 2]);
  });

  it("returns nothing for an empty feed", () => {
    expect(groupRecentDownloads([], true)).toEqual([]);
  });
});
