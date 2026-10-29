import {
  diffGrabRecords,
  formatEpisodeSpan,
  formatGrabBody,
  grabGroupTime,
  groupGrabRecords,
  radarrGrabNotices,
  radarrGrabRelease,
  sonarrGrabNotices,
  sonarrGrabRelease,
  type GrabNotice,
  type GrabWatchState,
} from "@/lib/arr-grab-format";
import type { RadarrHistoryRecord, SonarrHistoryRecord, SonarrEpisode } from "@/lib/types";

// The same cases as the backend's src/push/grab-format.test.ts, so the in-app
// notice and the backend push can't drift apart.

describe("formatEpisodeSpan", () => {
  it("names a single episode with its title", () => {
    expect(formatEpisodeSpan([{ seasonNumber: 1, episodeNumber: 2, title: "Pilot" }])).toBe("S01E02 - Pilot");
    expect(formatEpisodeSpan([{ seasonNumber: 12, episodeNumber: 3 }])).toBe("S12E03");
  });

  it("gives a range for several episodes of one season", () => {
    const eps = [3, 1, 10, 2].map((n) => ({ seasonNumber: 1, episodeNumber: n }));
    expect(formatEpisodeSpan(eps)).toBe("S01E01-E10");
  });

  it("gives a season range across seasons", () => {
    expect(
      formatEpisodeSpan([
        { seasonNumber: 3, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 2, episodeNumber: 5 },
      ]),
    ).toBe("S01-S03");
  });

  it("skips unusable entries", () => {
    expect(formatEpisodeSpan([])).toBe("");
    expect(formatEpisodeSpan([{ title: "No numbers" }])).toBe("");
    expect(formatEpisodeSpan([{ seasonNumber: 1 }, { seasonNumber: 2, episodeNumber: 4, title: "Kept" }])).toBe(
      "S02E04 - Kept",
    );
  });
});

describe("formatGrabBody", () => {
  it("joins the parts that exist", () => {
    expect(
      formatGrabBody({ subject: "Dune (2021)", quality: "Bluray-2160p", sizeBytes: 62_599_384_678, indexer: "NZBgeek" }),
    ).toBe("Dune (2021) · Bluray-2160p · 58.3 GB · NZBgeek");
    expect(formatGrabBody({ subject: "Dune (2021)", indexer: "NZBgeek" })).toBe("Dune (2021) · NZBgeek");
    expect(formatGrabBody({ subject: "Dune (2021)", sizeBytes: 0 })).toBe("Dune (2021)");
  });
});

describe("groupGrabRecords", () => {
  it("groups by release: downloadId, else series and title, else record id", () => {
    const rec = (id: number, extra: Partial<SonarrHistoryRecord>): SonarrHistoryRecord => ({
      id,
      eventType: "grabbed",
      ...extra,
    });
    const groups = groupGrabRecords(
      [
        rec(1, { downloadId: "A" }),
        rec(2, { downloadId: "B" }),
        rec(3, { downloadId: "A" }),
        rec(4, { seriesId: 3, sourceTitle: "Show.S01" }),
        rec(5, { seriesId: 3, sourceTitle: "Show.S01" }),
        rec(6, { seriesId: 4, sourceTitle: "Show.S01" }),
        rec(7, {}),
        rec(8, {}),
      ],
      sonarrGrabRelease,
    );
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[1, 3], [2], [4, 5], [6], [7], [8]]);
  });
});

describe("radarrGrabNotices", () => {
  it("builds the movie notice from the grabbed record", () => {
    const record: RadarrHistoryRecord = {
      id: 9,
      eventType: "grabbed",
      sourceTitle: "Dune.2021.1080p.BluRay",
      movieId: 7,
      movie: { id: 7, title: "Dune", year: 2021 } as RadarrHistoryRecord["movie"],
      downloadId: "HASH",
      quality: { quality: { id: 7, name: "Bluray-1080p" } },
      data: { indexer: "TorrentLeech", size: "1610612736" },
    };
    expect(radarrGrabNotices([record], "inst-r")).toEqual([
      {
        title: "Movie grabbed",
        body: "Dune (2021) · Bluray-1080p · 1.5 GB · TorrentLeech",
        data: { type: "radarr", movieId: 7, historyId: 9, instanceId: "inst-r" },
      },
    ]);
  });

  it("falls back to the release name without a movie", () => {
    const [notice] = radarrGrabNotices([{ id: 1, eventType: "grabbed", sourceTitle: "Some.Movie.2020" }], "i");
    expect(notice.body).toBe("Some.Movie.2020");
  });
});

describe("sonarrGrabNotices", () => {
  const episode = (n: number) =>
    ({ id: 100 + n, seriesId: 3, seasonNumber: 1, episodeNumber: n, title: `Ep ${n}` }) as SonarrEpisode;

  it("raises one notice for a season pack's per-episode records", () => {
    const pack: SonarrHistoryRecord[] = [3, 2, 1].map((n) => ({
      id: 50 + n,
      eventType: "grabbed",
      seriesId: 3,
      series: { id: 3, title: "Severance" } as SonarrHistoryRecord["series"],
      episode: episode(n),
      downloadId: "PACK",
      quality: { quality: { id: 3, name: "WEBDL-1080p" } },
      data: { indexer: "DrunkenSlug", size: "3221225472" },
    }));
    const notices = sonarrGrabNotices(pack, "inst-s");
    expect(notices).toEqual([
      {
        title: "Episode grabbed",
        body: "Severance S01E01-E03 · WEBDL-1080p · 3.0 GB · DrunkenSlug",
        data: { type: "sonarr", seriesId: 3, historyId: 53, instanceId: "inst-s" },
      },
    ]);
  });

  it("raises one notice for a season pack without a downloadId (Blackhole)", () => {
    const pack: SonarrHistoryRecord[] = Array.from({ length: 10 }, (_, i) => ({
      id: 70 + i,
      eventType: "grabbed",
      seriesId: 3,
      series: { id: 3, title: "Severance" } as SonarrHistoryRecord["series"],
      episode: episode(i + 1),
      sourceTitle: "Severance.S01.1080p.WEB-DL",
    }));
    const notices = sonarrGrabNotices(pack, "inst-s");
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toBe("Severance S01E01-E10");
  });

  it("names a single episode with its title", () => {
    const [notice] = sonarrGrabNotices(
      [
        {
          id: 60,
          eventType: "grabbed",
          seriesId: 4,
          series: { id: 4, title: "Andor" } as SonarrHistoryRecord["series"],
          episode: { ...episode(1), seasonNumber: 2, title: "One Year Later" },
        },
      ],
      "i",
    );
    expect(notice.body).toBe("Andor S02E01 - One Year Later");
  });
});

describe("grabGroupTime", () => {
  it("takes a pack's earliest record date, else now", () => {
    const pack = [{ date: "2026-10-29T10:00:02Z" }, { date: "2026-10-29T10:00:00Z" }, { date: "not a date" }];
    expect(grabGroupTime(pack, 5)).toBe(Date.parse("2026-10-29T10:00:00Z"));
    expect(grabGroupTime([{}, { date: "" }], 5)).toBe(5);
  });
});

// Drives diffGrabRecords poll by poll exactly as useGrabNotifications does and
// collects every notice the watcher would have raised.
function watchGrabs<R extends { id: number; eventType: string; date?: string }>(
  polls: { records: R[]; now?: number }[],
  releaseOf: (r: R) => string,
  toNotices: (fresh: R[], instanceId: string) => GrabNotice[],
): GrabNotice[] {
  let state: GrabWatchState | null = null;
  const sent: GrabNotice[] = [];
  for (const poll of polls) {
    const step: { fresh: R[]; next: GrabWatchState } = diffGrabRecords(state, poll.records, releaseOf, poll.now);
    state = step.next;
    sent.push(...toNotices(step.fresh, "inst"));
  }
  return sent;
}

describe("grab watcher across polls", () => {
  const series = { id: 3, title: "Severance" } as SonarrHistoryRecord["series"];
  const ep = (id: number, n: number, date?: string, downloadId = "SAME-PACK"): SonarrHistoryRecord => ({
    id,
    eventType: "grabbed",
    date,
    seriesId: 3,
    series,
    episode: { id: 100 + n, seriesId: 3, seasonNumber: 1, episodeNumber: n } as SonarrEpisode,
    downloadId,
  });
  const watch = (polls: { records: SonarrHistoryRecord[]; now?: number }[]) =>
    watchGrabs(polls, sonarrGrabRelease, sonarrGrabNotices);

  it("raises one notice for a season pack split across two polls", () => {
    const e1 = ep(1, 1, "2026-10-29T10:00:00Z");
    const e2 = ep(2, 2, "2026-10-29T10:00:01Z");
    const sent = watch([{ records: [] }, { records: [e1] }, { records: [e2, e1] }]);
    expect(sent.map((n) => n.body)).toEqual(["Severance S01E01"]);
  });

  it("stays quiet for the rest of a pack whose start was in the baseline", () => {
    const e1 = ep(1, 1, "2026-10-29T10:00:00Z");
    const e2 = ep(2, 2, "2026-10-29T10:00:01Z");
    expect(watch([{ records: [e1] }, { records: [e2, e1] }])).toEqual([]);
  });

  it("notifies again for a later re-grab of the same release", () => {
    const e1 = ep(1, 1, "2026-10-29T10:00:00Z");
    const e2 = ep(2, 2, "2026-10-29T10:00:00Z");
    const again1 = ep(3, 1, "2026-10-30T10:00:00Z");
    const again2 = ep(4, 2, "2026-10-30T10:00:01Z");
    const sent = watch([
      { records: [] },
      { records: [e2, e1] },
      { records: [again1, e2, e1] },
      { records: [again2, again1, e2, e1] },
    ]);
    expect(sent.map((n) => n.body)).toEqual(["Severance S01E01-E02", "Severance S01E01"]);
  });

  it("falls back to the poll time for records without a date", () => {
    const t = Date.parse("2026-10-29T10:00:00Z");
    const e1 = ep(1, 1);
    const e2 = ep(2, 2);
    const later = ep(3, 1, undefined);
    const sent = watch([
      { records: [], now: t },
      { records: [e1], now: t + 30_000 },
      { records: [e2, e1], now: t + 60_000 },
      { records: [later, e2, e1], now: t + 24 * 3_600_000 },
    ]);
    expect(sent).toHaveLength(2);
  });

  it("forgets releases once they leave the page", () => {
    const old = ep(1, 1, "2026-10-29T10:00:00Z", "OLD");
    const other = ep(2, 1, "2026-10-29T11:00:00Z", "OTHER");
    const { next } = diffGrabRecords(null, [old], sonarrGrabRelease);
    const { next: after } = diffGrabRecords(next, [other], sonarrGrabRelease);
    expect([...after.announced.keys()]).toEqual(["OTHER"]);
  });

  it("raises one Radarr notice per new grab", () => {
    const grab = (id: number, downloadId: string, date: string): RadarrHistoryRecord => ({
      id,
      eventType: "grabbed",
      date,
      movieId: 7,
      movie: { id: 7, title: "Dune", year: 2021 } as RadarrHistoryRecord["movie"],
      downloadId,
    });
    const a = grab(1, "A", "2026-10-29T10:00:00Z");
    const b = grab(2, "B", "2026-10-29T10:05:00Z");
    const aAgain = grab(3, "A", "2026-10-30T10:00:00Z");
    const sent = watchGrabs(
      [{ records: [] }, { records: [b, a] }, { records: [aAgain, b, a] }],
      radarrGrabRelease,
      radarrGrabNotices,
    );
    expect(sent.map((n) => n.data.historyId)).toEqual([2, 1, 3]);
  });
});
