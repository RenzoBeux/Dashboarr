import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRadarrGrabWebhookEvent,
  buildRadarrHistoryGrabEvents,
  buildSonarrGrabWebhookEvent,
  buildSonarrHistoryGrabEvents,
  formatBytes,
  formatEpisodeSpan,
  formatGrabBody,
  GRAB_REPEAT_WINDOW_MS,
  grabGroupTime,
  groupGrabRecords,
  sonarrGrabRelease,
} from "./grab-format.js";
import type { RadarrHistoryRecord } from "../services/radarr.js";
import type { SonarrHistoryRecord } from "../services/sonarr.js";

test("formatBytes mirrors the app's 1024-base, 1-decimal output", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512.0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(62_599_384_678), "58.3 GB");
  // Clamped to TB rather than indexing past the unit list.
  assert.equal(formatBytes(1024 ** 5), "1024.0 TB");
});

test("formatEpisodeSpan: single episode carries its title", () => {
  assert.equal(formatEpisodeSpan([{ seasonNumber: 1, episodeNumber: 2, title: "Pilot" }]), "S01E02 - Pilot");
  assert.equal(formatEpisodeSpan([{ seasonNumber: 12, episodeNumber: 3 }]), "S12E03");
});

test("formatEpisodeSpan: several episodes of one season give a range", () => {
  const eps = [3, 1, 10, 2].map((n) => ({ seasonNumber: 1, episodeNumber: n, title: `E${n}` }));
  assert.equal(formatEpisodeSpan(eps), "S01E01-E10");
});

test("formatEpisodeSpan: several seasons give a season range", () => {
  const eps = [
    { seasonNumber: 3, episodeNumber: 1 },
    { seasonNumber: 1, episodeNumber: 1 },
    { seasonNumber: 2, episodeNumber: 5 },
  ];
  assert.equal(formatEpisodeSpan(eps), "S01-S03");
});

test("formatEpisodeSpan: unusable entries are skipped, nothing usable gives empty", () => {
  assert.equal(formatEpisodeSpan([]), "");
  assert.equal(formatEpisodeSpan([{ title: "No numbers" }]), "");
  assert.equal(
    formatEpisodeSpan([{ seasonNumber: 1 }, { seasonNumber: 2, episodeNumber: 4, title: "Kept" }]),
    "S02E04 - Kept",
  );
  // The same episode listed twice is still a single episode.
  assert.equal(
    formatEpisodeSpan([
      { seasonNumber: 1, episodeNumber: 4, title: "Twice" },
      { seasonNumber: 1, episodeNumber: 4 },
    ]),
    "S01E04 - Twice",
  );
});

test("formatGrabBody joins the parts that exist and skips the rest", () => {
  assert.equal(
    formatGrabBody({ subject: "Dune (2021)", quality: "Bluray-2160p", sizeBytes: 62_599_384_678, indexer: "NZBgeek" }),
    "Dune (2021) · Bluray-2160p · 58.3 GB · NZBgeek",
  );
  assert.equal(formatGrabBody({ subject: "Dune (2021)", indexer: "NZBgeek" }), "Dune (2021) · NZBgeek");
  assert.equal(formatGrabBody({ subject: "Dune (2021)", sizeBytes: 0 }), "Dune (2021)");
  assert.equal(formatGrabBody({ subject: "Dune (2021)", sizeBytes: Number.NaN }), "Dune (2021)");
});

test("Radarr Grab webhook builds the push with its own grabbed dedupe segment", () => {
  const event = buildRadarrGrabWebhookEvent(
    {
      movie: { id: 7, title: "Dune: Part Two", year: 2024 },
      release: { quality: "WEBDL-2160p", size: 64_424_509_440, indexer: "NZBgeek (Prowlarr)", releaseTitle: "Dune.Part.Two" },
      downloadId: "SABnzbd_nzo_abc",
    },
    undefined,
    "",
    1_000,
  );
  assert.deepEqual(event, {
    category: "radarrGrabbed",
    title: "Movie grabbed",
    body: "Dune: Part Two (2024) · WEBDL-2160p · 60.0 GB · NZBgeek (Prowlarr)",
    data: { type: "radarr", movieId: 7, instanceId: undefined },
    dedupeKey: "radarr:grabbed:any:SABnzbd_nzo_abc",
    dedupeOccurrence: { at: 1_000, windowMs: GRAB_REPEAT_WINDOW_MS },
  });
});

test("Radarr Grab webhook: instance namespace and prefix, and null without a movie", () => {
  const event = buildRadarrGrabWebhookEvent(
    { movie: { id: 7, title: "Dune" }, release: { releaseTitle: "Dune.2021" } },
    "inst-1",
    "Radarr 4K: ",
  );
  assert.equal(event?.title, "Radarr 4K: Movie grabbed");
  assert.equal(event?.body, "Dune");
  assert.equal(event?.dedupeKey, "radarr:grabbed:inst-1:movie-7:Dune.2021");
  assert.equal(buildRadarrGrabWebhookEvent({ release: { quality: "x" } }, undefined, ""), null);
});

test("Sonarr Grab webhook spans a season pack in one push", () => {
  const episodes = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, seasonNumber: 2, episodeNumber: i + 1 }));
  const event = buildSonarrGrabWebhookEvent(
    {
      series: { id: 3, title: "Severance" },
      episodes,
      release: { quality: "WEBDL-1080p", size: 21_474_836_480, indexer: "DrunkenSlug" },
      downloadId: "HASH",
    },
    "inst-s",
    "",
    2_000,
  );
  assert.deepEqual(event, {
    category: "sonarrGrabbed",
    title: "Episode grabbed",
    body: "Severance S02E01-E10 · WEBDL-1080p · 20.0 GB · DrunkenSlug",
    data: { type: "sonarr", seriesId: 3, episodeId: 100, instanceId: "inst-s" },
    dedupeKey: "sonarr:grabbed:inst-s:HASH",
    dedupeOccurrence: { at: 2_000, windowMs: GRAB_REPEAT_WINDOW_MS },
  });
  assert.equal(buildSonarrGrabWebhookEvent({ episodes }, undefined, ""), null);
});

test("groupGrabRecords groups by release: downloadId, else series and title, else record id", () => {
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
  assert.deepEqual(
    groups.map((g) => g.map((r) => r.id)),
    [[1, 3], [2], [4, 5], [6], [7], [8]],
  );
});

test("Radarr history grabs read quality, size and indexer from the record", () => {
  const [event, ...rest] = buildRadarrHistoryGrabEvents(
    [
      {
        id: 9,
        eventType: "grabbed",
        date: "2026-10-29T10:00:00Z",
        movieId: 7,
        movie: { id: 7, title: "Dune", year: 2021 },
        downloadId: "HASH",
        quality: { quality: { name: "Bluray-1080p" } },
        data: { indexer: "TorrentLeech", size: "1610612736" },
      },
    ],
    "inst-1",
    "",
  );
  assert.equal(rest.length, 0);
  assert.deepEqual(event, {
    category: "radarrGrabbed",
    title: "Movie grabbed",
    body: "Dune (2021) · Bluray-1080p · 1.5 GB · TorrentLeech",
    data: { type: "radarr", movieId: 7, instanceId: "inst-1" },
    // Identical to the webhook's key once it resolves the same instance.
    dedupeKey: "radarr:grabbed:inst-1:HASH",
    dedupeOccurrence: { at: Date.parse("2026-10-29T10:00:00Z"), windowMs: GRAB_REPEAT_WINDOW_MS },
  });
});

test("Sonarr history grabs: a season pack's per-episode records become one push", () => {
  const pack: SonarrHistoryRecord[] = [3, 2, 1].map((n) => ({
    id: 50 + n,
    eventType: "grabbed",
    seriesId: 3,
    series: { id: 3, title: "Severance" },
    episode: { seasonNumber: 1, episodeNumber: n, title: `Ep ${n}` },
    downloadId: "PACK",
    quality: { quality: { name: "WEBDL-1080p" } },
    data: { indexer: "DrunkenSlug", size: "3221225472" },
  }));
  const single: SonarrHistoryRecord = {
    id: 60,
    eventType: "grabbed",
    seriesId: 4,
    series: { id: 4, title: "Andor" },
    episode: { seasonNumber: 2, episodeNumber: 1, title: "One Year Later" },
    sourceTitle: "Andor.S02E01",
  };
  const events = buildSonarrHistoryGrabEvents([...pack, single], "inst-s", "Sonarr: ");
  assert.equal(events.length, 2);
  assert.equal(events[0]!.body, "Severance S01E01-E03 · WEBDL-1080p · 3.0 GB · DrunkenSlug");
  assert.equal(events[0]!.title, "Sonarr: Episode grabbed");
  assert.equal(events[0]!.dedupeKey, "sonarr:grabbed:inst-s:PACK");
  assert.deepEqual(events[0]!.data, { type: "sonarr", seriesId: 3, instanceId: "inst-s" });
  assert.equal(events[1]!.body, "Andor S02E01 - One Year Later");
  assert.equal(events[1]!.dedupeKey, "sonarr:grabbed:inst-s:series-4:Andor.S02E01");
});

// Blackhole clients return no download id, so upstream leaves DownloadId unset
// on the grab. The release title is then what ties the records together.
test("Sonarr history grabs: a season pack without a downloadId is still one push", () => {
  const pack: SonarrHistoryRecord[] = Array.from({ length: 10 }, (_, i) => ({
    id: 70 + i,
    eventType: "grabbed",
    seriesId: 3,
    series: { id: 3, title: "Severance" },
    episode: { seasonNumber: 1, episodeNumber: i + 1 },
    sourceTitle: "Severance.S01.1080p.WEB-DL",
  }));
  const events = buildSonarrHistoryGrabEvents(pack, "inst-s", "");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.body, "Severance S01E01-E10");
  assert.equal(events[0]!.dedupeKey, "sonarr:grabbed:inst-s:series-3:Severance.S01.1080p.WEB-DL");
});

test("without a downloadId the webhook and the poller still build the same key", () => {
  const radarrHook = buildRadarrGrabWebhookEvent(
    { movie: { id: 7, title: "Dune" }, release: { releaseTitle: "Dune.2021.1080p" } },
    "inst-r",
    "",
  );
  const radarrRecord: RadarrHistoryRecord = {
    id: 9,
    eventType: "grabbed",
    movieId: 7,
    movie: { id: 7, title: "Dune" },
    sourceTitle: "Dune.2021.1080p",
  };
  const [radarrPoll] = buildRadarrHistoryGrabEvents([radarrRecord], "inst-r", "");
  assert.equal(radarrHook?.dedupeKey, "radarr:grabbed:inst-r:movie-7:Dune.2021.1080p");
  assert.equal(radarrPoll!.dedupeKey, radarrHook?.dedupeKey);

  const sonarrHook = buildSonarrGrabWebhookEvent(
    {
      series: { id: 3, title: "Severance" },
      episodes: [1, 2].map((n) => ({ id: n, seasonNumber: 1, episodeNumber: n })),
      release: { releaseTitle: "Severance.S01.1080p" },
    },
    "inst-s",
    "",
  );
  const sonarrRecords: SonarrHistoryRecord[] = [1, 2].map((n) => ({
    id: 80 + n,
    eventType: "grabbed",
    seriesId: 3,
    episode: { seasonNumber: 1, episodeNumber: n },
    sourceTitle: "Severance.S01.1080p",
  }));
  const sonarrPoll = buildSonarrHistoryGrabEvents(sonarrRecords, "inst-s", "");
  assert.equal(sonarrPoll.length, 1);
  assert.equal(sonarrHook?.dedupeKey, "sonarr:grabbed:inst-s:series-3:Severance.S01.1080p");
  assert.equal(sonarrPoll[0]!.dedupeKey, sonarrHook?.dedupeKey);
});

test("history grabs fall back to the release name when the series/movie is missing", () => {
  const [radarr] = buildRadarrHistoryGrabEvents(
    [{ id: 1, eventType: "grabbed", sourceTitle: "Some.Movie.2020.1080p" }],
    "i",
    "",
  );
  assert.equal(radarr!.body, "Some.Movie.2020.1080p");
  const [sonarr] = buildSonarrHistoryGrabEvents(
    [{ id: 2, eventType: "grabbed", sourceTitle: "Some.Show.S01E01" }],
    "i",
    "",
  );
  assert.equal(sonarr!.body, "Some.Show.S01E01");
});

test("grabGroupTime: a pack's earliest record date, else now", () => {
  const pack = [
    { date: "2026-10-29T10:00:02Z" },
    { date: "2026-10-29T10:00:00Z" },
    { date: "not a date" },
  ];
  assert.equal(grabGroupTime(pack, 5), Date.parse("2026-10-29T10:00:00Z"));
  assert.equal(grabGroupTime([{}, { date: "" }], 5), 5);
});
