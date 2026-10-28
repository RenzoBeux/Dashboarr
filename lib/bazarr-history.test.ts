import {
  groupHistoryByDay,
  historyActionMeta,
  historyStreamsToPage,
  mergeHistoryStreams,
  parseBazarrTimestamp,
} from "./bazarr-history";
import type { BazarrHistoryItem } from "./types";

describe("historyActionMeta", () => {
  it("maps Bazarr's action codes", () => {
    expect(historyActionMeta(1).kind).toBe("downloaded");
    expect(historyActionMeta(3).kind).toBe("upgraded");
    expect(historyActionMeta(7).label).toBe("Extracted");
    expect(historyActionMeta(42).kind).toBe("unknown");
  });
});

describe("parseBazarrTimestamp", () => {
  it("reads the C locale (month first, 2-digit year)", () => {
    expect(parseBazarrTimestamp("10/09/26 14:22:05")).toEqual(new Date(2026, 9, 9, 14, 22, 5));
  });

  it("reads en_US with AM/PM", () => {
    expect(parseBazarrTimestamp("10/09/2026 02:22:05 PM")).toEqual(new Date(2026, 9, 9, 14, 22, 5));
    expect(parseBazarrTimestamp("10/09/2026 12:05:00 AM")).toEqual(new Date(2026, 9, 9, 0, 5, 0));
  });

  it("reads day-first dotted dates", () => {
    expect(parseBazarrTimestamp("09.10.2026 14:22:05")).toEqual(new Date(2026, 9, 9, 14, 22, 5));
  });

  it("reads ISO", () => {
    expect(parseBazarrTimestamp("2026-10-09T14:22:05Z")?.toISOString()).toBe("2026-10-09T14:22:05.000Z");
  });

  it("gives up on anything else", () => {
    expect(parseBazarrTimestamp("2 hours ago")).toBeNull();
    expect(parseBazarrTimestamp("13/45/26 10:00:00")).toBeNull();
    expect(parseBazarrTimestamp(undefined)).toBeNull();
  });
});

const item = (ts: string, extra: Partial<BazarrHistoryItem> = {}): BazarrHistoryItem => ({
  action: 1,
  timestamp: "",
  parsed_timestamp: ts,
  description: "",
  ...extra,
});

describe("mergeHistoryStreams", () => {
  const movies = [item("10/09/26 14:00:00"), item("10/07/26 09:00:00")];
  const episodes = [item("10/08/26 12:00:00"), item("10/01/26 12:00:00")];

  it("merges newest first", () => {
    const merged = mergeHistoryStreams(movies, episodes, { movies: false, episodes: false });
    expect(merged.map((e) => `${e.kind}:${e.item.parsed_timestamp}`)).toEqual([
      "movie:10/09/26 14:00:00",
      "episode:10/08/26 12:00:00",
      "movie:10/07/26 09:00:00",
      "episode:10/01/26 12:00:00",
    ]);
  });

  it("holds back entries older than a stream that has more pages", () => {
    const merged = mergeHistoryStreams(movies, episodes, { movies: true, episodes: false });
    // Movies stop at Oct 7 with more to load, so Oct 1 waits.
    expect(merged.map((e) => e.item.parsed_timestamp)).not.toContain("10/01/26 12:00:00");
    expect(merged).toHaveLength(3);
  });

  it("holds back from a stream's oldest entry, even when a newer one ends its pages", () => {
    // Offset paging after new arrivals: the last page ends on a fresh entry.
    const shifted = [item("10/09/26 14:00:00"), item("10/07/26 09:00:00"), item("10/10/26 08:00:00")];
    const merged = mergeHistoryStreams(shifted, episodes, { movies: true, episodes: false });
    expect(merged.map((x) => x.item.parsed_timestamp)).toEqual([
      "10/10/26 08:00:00",
      "10/09/26 14:00:00",
      "10/08/26 12:00:00",
      "10/07/26 09:00:00",
    ]);
  });

  it("drops an entry repeated across pages", () => {
    const dup = item("10/08/26 12:00:00", { sonarrEpisodeId: 7, subs_id: "x" });
    const merged = mergeHistoryStreams([], [dup, { ...dup }], { movies: false, episodes: false });
    expect(merged).toHaveLength(1);
  });

  it("keeps same-second entries for different variants of a language", () => {
    const en = { name: "English", code2: "en", code3: "eng", forced: false, hi: false };
    const merged = mergeHistoryStreams(
      [
        item("10/08/26 12:00:00", { radarrId: 3, action: 5, language: en }),
        item("10/08/26 12:00:00", { radarrId: 3, action: 5, language: { ...en, forced: true } }),
      ],
      [],
      { movies: false, episodes: false },
    );
    expect(merged).toHaveLength(2);
  });

  it("keeps entries without a parseable time at the end", () => {
    const merged = mergeHistoryStreams([item("garbage")], episodes, { movies: false, episodes: false });
    expect(merged[merged.length - 1].at).toBeNull();
  });
});

describe("historyStreamsToPage", () => {
  const movies = [item("10/09/26 14:00:00"), item("10/07/26 09:00:00")];
  const episodes = [item("10/08/26 12:00:00"), item("10/01/26 12:00:00")];
  const both = { movies: true, episodes: true };

  it("pages only the stream holding the cutoff", () => {
    // Movies end Oct 7, episodes Oct 1: the list waits on movies.
    expect(historyStreamsToPage(movies, episodes, both)).toEqual({ movies: true, episodes: false });
  });

  it("pages a stream only while it has more", () => {
    expect(historyStreamsToPage(movies, episodes, { movies: false, episodes: true })).toEqual({
      movies: false,
      episodes: true,
    });
  });

  it("pages both on a tie or when no last entry has a time", () => {
    expect(historyStreamsToPage([item("10/01/26 12:00:00")], episodes, both)).toEqual(both);
    expect(historyStreamsToPage([item("garbage")], [item("nope")], both)).toEqual(both);
  });
});

describe("groupHistoryByDay", () => {
  it("groups by local day with an Earlier bucket", () => {
    const merged = mergeHistoryStreams(
      [item("10/09/26 14:00:00"), item("10/09/26 09:00:00"), item("nope")],
      [],
      { movies: false, episodes: false },
    );
    const groups = groupHistoryByDay(merged);
    expect(groups.map((g) => g.entries.length)).toEqual([2, 1]);
    expect(groups[1].label).toBe("Earlier");
  });
});
