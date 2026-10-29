import type {
  RadarrMovie,
  SonarrSeries,
  LidarrArtist,
  LidarrAlbum,
  BinderyBook,
} from "@/lib/types";
import { formatEta } from "@/lib/utils";

/**
 * Sonarr/Radarr-style poster status indicators (issue #47).
 *
 * The bar-color logic is a faithful port of the *arr frontends so the colors
 * mean exactly what they mean in Sonarr/Radarr:
 *   - Sonarr: frontend/src/Utilities/Series/getProgressBarKind.ts
 *   - Radarr: frontend/src/Utilities/Movie/getProgressBarKind.ts
 * The corner triangle mirrors SeriesIndexPoster/MovieIndexPoster (top-right
 * ribbon): Sonarr shows red for `ended`, both show gray for `deleted`.
 */

export type PosterBarKind =
  | "purple"
  | "success"
  | "primary"
  | "danger"
  | "warning"
  | "default"
  | "inverse";

/** Bar-kind → hex. The 5 semantic kinds reuse the app theme (tailwind.config.ts). */
export const BAR_KIND_COLOR: Record<PosterBarKind, string> = {
  primary: "#3b82f6",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  purple: "#a855f7",
  default: "#71717a",
  inverse: "#52525b",
};

/**
 * Neutral track behind the poster bar's proportional fill, matching the *arr
 * ProgressBar (a gray track + a kind-colored fill sized to the progress %). A
 * 0%-progress item therefore reads as this gray track, not a solid color block.
 */
export const BAR_TRACK_COLOR = "#3f3f46"; // zinc-700

/**
 * Per-item download indicator (issue #207). A single episode / movie / track /
 * calendar row reads the SAME color everywhere it appears — the poster grid, the
 * detail-screen spine bar, and the calendar row — so the app's status cues stay
 * consistent and mirror Sonarr/Radarr:
 *   - downloading (in the *arr queue) → purple  (same purple as the poster bar)
 *   - downloaded  (hasFile)           → green
 *   - pending     (neither)           → neutral gray
 *
 * Before #207 the detail/calendar indicators only knew green/gray and never
 * turned purple while a grab was in progress, unlike the poster grid which has
 * always shown purple via the bar-kind logic above.
 */
export type DownloadIndicator = "downloading" | "downloaded" | "pending";

export function downloadIndicator(
  hasFile: boolean,
  isDownloading: boolean,
): DownloadIndicator {
  if (isDownloading) return "downloading";
  if (hasFile) return "downloaded";
  return "pending";
}

/**
 * Indicator → hex, for the inline-styled spine bars. `downloading` reuses the
 * exact poster-bar purple so the grid poster and the detail spine match; the
 * `bg-purple-500` / `bg-purple-600` Tailwind tokens used for className-based
 * consumers (ProgressBar fill, Badge) resolve to the same #a855f7 family.
 */
export const DOWNLOAD_INDICATOR_COLOR: Record<DownloadIndicator, string> = {
  downloading: BAR_KIND_COLOR.purple, // #a855f7
  downloaded: BAR_KIND_COLOR.success, // #22c55e
  pending: "#52525b", // zinc-600 — the long-standing "no file yet" neutral
};

/**
 * Queue records the *arr is still holding itself (issue #484): a delay profile
 * is waiting out its window, or the download client was unreachable when the
 * grab was due. Sonarr/Radarr/Lidarr's GET /queue appends these pending
 * releases to the tracked downloads (QueueController: `Concat(pending)`), so
 * they look like any other record except for `status`, which comes from the
 * QueueStatus enum serialized camelCase ("delay", "downloadClientUnavailable").
 * They carry no trackedDownload* fields and `sizeleft === size`. Upstream's own
 * queue and calendar group both under a clock "Pending" icon. Lidarr still
 * emits the status as a lowercased-first-char string, hence the
 * case-insensitive compare. Fallback releases never reach the queue.
 *
 * Named "held", not "pending": DownloadIndicator's `pending` above already means
 * "no file and not queued", and the dashboard has a "Still Pending" card.
 *
 * A held item keeps the purple bar kind (upstream's posters paint every queue
 * entry purple too); surfaces draw that purple dashed instead of solid, and it
 * goes solid once the download client has the release. Queued or paused items
 * inside the download client are real downloads and stay solid.
 */
const HELD_QUEUE_STATUSES = new Set(["delay", "downloadclientunavailable"]);

/** User-facing word for a held record, on badges, Progress blocks and queue rows. */
export const HELD_QUEUE_LABEL = "Delayed";

export type QueueActivity = "active" | "held";

export function isHeldQueueRecord(record: { status?: string | null }): boolean {
  return HELD_QUEUE_STATUSES.has((record.status ?? "").toLowerCase());
}

/**
 * Collapses queue records onto the item they belong to (an episode, movie,
 * series, album...). A key is `held` only when every record for it is held: one
 * record actually downloading makes the whole item `active`, whatever the
 * record order. Absent keys are not in the queue at all, so `map.has(id)` is
 * the old "is downloading" test. Records whose key is null/undefined are
 * skipped (Lidarr can omit albumId/artistId).
 */
export function queueActivityMap<R extends { status?: string | null }, K>(
  records: readonly R[] | null | undefined,
  keyOf: (record: R) => K | null | undefined,
): Map<K, QueueActivity> {
  const map = new Map<K, QueueActivity>();
  for (const record of records ?? []) {
    const key = keyOf(record);
    if (key == null) continue;
    if (map.get(key) === "active") continue;
    map.set(key, isHeldQueueRecord(record) ? "held" : "active");
  }
  return map;
}

/**
 * Keys that were held when they left the queue, carried from one queue
 * snapshot to the next (issue #484). The calendar surfaces keep a departed key
 * "downloading" for a moment while their refetch lands
 * (useRefreshOnDownloadComplete), but the held flag would drop at once, so a
 * hold removed from the queue flashed solid purple, as if the download client
 * had it, for that window. Adds what `previousHeld` had that `queued` lost, and
 * forgets any key queued again. `held` is always a subset of `queued`, so a
 * repeat call with the same sets returns the same keys.
 */
export function departedHolds<K>(
  remembered: ReadonlySet<K>,
  previousHeld: ReadonlySet<K>,
  queued: ReadonlySet<K>,
): Set<K> {
  const next = new Set<K>();
  for (const key of remembered) if (!queued.has(key)) next.add(key);
  for (const key of previousHeld) if (!queued.has(key)) next.add(key);
  return next;
}

interface QueueTimingRecord {
  status?: string | null;
  timeleft?: string | null;
}

/**
 * Short time label for a narrow queue tile: "ETA 1:02:03" for a real download.
 * A held record's `timeleft` counts down to when the *arr hands the release to
 * the client, not to a finished download, so it is no ETA: just "Delayed".
 */
export function queueEtaLabel(record: QueueTimingRecord): string | undefined {
  if (isHeldQueueRecord(record)) return HELD_QUEUE_LABEL;
  return record.timeleft ? `ETA ${record.timeleft}` : undefined;
}

/**
 * Subtitle for a narrow queue tile whose identity line ("S02E07", an artist
 * name) normally replaces the ETA. A held record leads with "Delayed" so the
 * tile still says it, and a long identity truncates instead of the label.
 * Without an identity it is queueEtaLabel.
 */
export function queueTileSubtitle(
  record: QueueTimingRecord,
  identity: string | null | undefined,
): string | undefined {
  if (!identity) return queueEtaLabel(record);
  return isHeldQueueRecord(record) ? `${HELD_QUEUE_LABEL} · ${identity}` : identity;
}

/**
 * Whole seconds in a serialized .NET TimeSpan ("[-][d.]hh:mm:ss[.fffffff]"),
 * or null when it doesn't parse.
 */
function timeSpanSeconds(value: string | null | undefined): number | null {
  const m = /^(-)?(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(
    (value ?? "").trim(),
  );
  if (!m) return null;
  const [, neg, days, h, min, sec, frac] = m;
  const total =
    Number(days ?? 0) * 86400 +
    Number(h) * 3600 +
    Number(min) * 60 +
    Number(sec) +
    (frac ? Number(`0.${frac}`) : 0);
  return Math.round(neg ? -total : total);
}

/**
 * Time caption under a full-width queue row. Like queueEtaLabel, but a held
 * record says when or why, after upstream's own queue: "Delaying download
 * until..." for a delay, "Pending - Download client is unavailable" for the
 * other hold.
 *
 * A delay's timeleft is `ect - UtcNow`, never rounded, so it arrives with the
 * TimeSpan's 7-digit fraction ("00:41:59.5123456"); it is reformatted like an
 * ETA. Past the window but before the next RSS sync it is clamped to
 * "00:00:00", which says nothing, so the caption is just the label.
 */
export function queueTimeCaption(record: QueueTimingRecord): string | undefined {
  const status = (record.status ?? "").toLowerCase();
  if (status === "downloadclientunavailable") {
    return `${HELD_QUEUE_LABEL} · download client unavailable`;
  }
  if (status === "delay") {
    const seconds = timeSpanSeconds(record.timeleft);
    return seconds != null && seconds > 0
      ? `${HELD_QUEUE_LABEL} · starts in ${formatEta(seconds)}`
      : HELD_QUEUE_LABEL;
  }
  return queueEtaLabel(record);
}

const CORNER_ENDED = "#ef4444"; // danger
const CORNER_DELETED = "#71717a"; // gray

/**
 * Series poster bar fill percentage (0–100), matching Sonarr's
 * SeriesIndexProgressBar: episodeFileCount / episodeCount, with an empty series
 * (no countable episodes) treated as 100% via Sonarr's own `: 100` fallback.
 * The bar is a track + proportional fill, so a 0%-progress series shows the gray
 * track even though its color (kind) is danger/warning (issue #171).
 */
export function sonarrBarProgress(series: SonarrSeries): number {
  const episodeCount = series.statistics?.episodeCount ?? series.episodeCount ?? 0;
  const episodeFileCount =
    series.statistics?.episodeFileCount ?? series.episodeFileCount ?? 0;
  return episodeCount ? (episodeFileCount / episodeCount) * 100 : 100;
}

/**
 * Port of Sonarr's getProgressBarKind(status, monitored, progress, isDownloading).
 * progress = episodeFileCount / episodeCount * 100 (no episodes ⇒ treated complete).
 */
export function sonarrBarKind(series: SonarrSeries, isDownloading: boolean): PosterBarKind {
  if (isDownloading) return "purple";

  const progress = sonarrBarProgress(series);

  if (progress === 100) {
    return series.status === "ended" ? "success" : "primary";
  }
  if (series.monitored) return "danger";
  return "warning";
}

/**
 * Per-episode bar kind (issue #217). A single episode reads the same color
 * wherever it appears — the calendar, the Still Pending card, the series detail
 * list — using the same kind→color mapping the series poster uses in the grid,
 * so the "color bars should match" complaint goes away. Mirrors the *arr
 * episode-status semantics; structured like radarrBarKind (first match wins):
 *   downloading → purple, has file → green, unmonitored & missing → gray,
 *   monitored & aired & missing → red (danger), monitored & not yet aired → blue.
 * `now` is injectable for deterministic tests (defaults to the current time).
 */
export function sonarrEpisodeBarKind(
  episode: { hasFile: boolean; monitored: boolean; airDateUtc?: string },
  isDownloading: boolean,
  now: number = Date.now(),
): PosterBarKind {
  if (isDownloading) return "purple";
  if (episode.hasFile) return "success";
  if (!episode.monitored) return "default";
  const aired = episode.airDateUtc
    ? Date.parse(episode.airDateUtc) <= now
    : false;
  return aired ? "danger" : "primary";
}

/**
 * Port of Radarr's getProgressBarKind(status, monitored, hasFile, isAvailable,
 * isDownloading). Branches are evaluated in order; first match wins.
 */
export function radarrBarKind(movie: RadarrMovie, isDownloading: boolean): PosterBarKind {
  if (isDownloading) return "purple";
  if (movie.hasFile && movie.monitored) return "success";
  if (movie.hasFile && !movie.monitored) return "default";
  if (movie.status === "deleted") return "inverse";
  if (movie.isAvailable && movie.monitored) return "danger";
  if (!movie.monitored) return "warning";
  return "primary";
}

/**
 * Tracks on disk vs. tracks wanted for an artist. `total` is Lidarr's
 * `trackCount`, never `totalTrackCount`: ArtistStatisticsRepository counts a
 * track toward `trackCount` only when its album is monitored and released, or
 * the track already has a file, whereas `totalTrackCount` is every track of
 * every album. Dividing by the latter makes each unmonitored album read as
 * "missing" (issue #383). Every artist progress surface (poster bar, detail
 * Progress block, stats strip) derives from this so they cannot drift.
 */
export function lidarrArtistTrackCounts(artist: LidarrArtist): {
  have: number;
  total: number;
} {
  return {
    have: artist.statistics?.trackFileCount ?? 0,
    total: artist.statistics?.trackCount ?? 0,
  };
}

/** Artist poster bar fill percentage (0–100) — trackFileCount / trackCount, the
 * Sonarr-style proportional fill Lidarr's ArtistIndexProgressBar uses. */
export function lidarrArtistBarProgress(artist: LidarrArtist): number {
  const { have, total } = lidarrArtistTrackCounts(artist);
  return total ? (have / total) * 100 : 100;
}

/**
 * Lidarr artist progress bar — same shape as Sonarr's series logic, but the
 * progress denominator is tracks (trackFileCount / trackCount). An `ended`
 * artist that's fully downloaded reads green; an in-progress monitored artist
 * reads red (missing), unmonitored reads amber.
 */
export function lidarrArtistBarKind(
  artist: LidarrArtist,
  isDownloading: boolean,
): PosterBarKind {
  if (isDownloading) return "purple";
  const progress = lidarrArtistBarProgress(artist);
  if (progress >= 100) {
    return artist.status === "ended" ? "success" : "primary";
  }
  if (artist.monitored) return "danger";
  return "warning";
}

/**
 * Lidarr album progress bar — tracks present vs. expected on the album. A fully
 * downloaded album reads green; a monitored album missing tracks reads red;
 * unmonitored reads amber.
 */
export function lidarrAlbumBarKind(
  album: LidarrAlbum,
  isDownloading: boolean,
): PosterBarKind {
  if (isDownloading) return "purple";
  const trackCount = album.statistics?.trackCount ?? 0;
  const fileCount = album.statistics?.trackFileCount ?? 0;
  const progress = trackCount ? (fileCount / trackCount) * 100 : 100;
  if (progress >= 100) return "success";
  if (album.monitored) return "danger";
  return "warning";
}

/**
 * Bindery books. Deliberately NOT paired with an author-level bar: Bindery's
 * AuthorStats declares availableBookCount and wantedBookCount but never
 * assigns either (upstream builds the struct in one place and sets bookCount
 * alone), so an author progress bar computed from them would read 0% or 100%
 * for every author forever. The Books grid shows the real book count instead,
 * and the author screen derives true counts from its embedded books[].
 *
 * Books themselves carry a real per-item status, so their bar is honest:
 * downloaded or imported reads green, a monitored book still wanted reads red,
 * unmonitored reads amber.
 */
export function binderyBookBarKind(
  book: BinderyBook,
  isDownloading: boolean,
): PosterBarKind {
  if (isDownloading) return "purple";
  if (book.status === "downloaded" || book.status === "imported") return "success";
  if (book.monitored) return "danger";
  return "warning";
}

/**
 * "Missing" predicates for the library filter (issue #265): released/aired but
 * not downloaded, monitored only. Each mirrors its service's danger-bar branch
 * above so the filter and the red poster bar select the same items.
 */
export function radarrIsMissing(movie: RadarrMovie): boolean {
  return movie.monitored && movie.isAvailable && !movie.hasFile;
}

export function sonarrIsMissing(series: SonarrSeries): boolean {
  return series.monitored && sonarrBarProgress(series) < 100;
}

export function lidarrArtistIsMissing(artist: LidarrArtist): boolean {
  return artist.monitored && lidarrArtistBarProgress(artist) < 100;
}

export function lidarrAlbumIsMissing(album: LidarrAlbum): boolean {
  const trackCount = album.statistics?.trackCount ?? 0;
  const fileCount = album.statistics?.trackFileCount ?? 0;
  return album.monitored && trackCount > 0 && fileCount < trackCount;
}

// Mirrors binderyBookBarKind's danger branch.
export function binderyBookIsMissing(book: BinderyBook): boolean {
  return book.monitored && book.status !== "downloaded" && book.status !== "imported";
}

/**
 * Top-right corner triangle color, or null for no triangle.
 * Sonarr: `ended` → red, `deleted` → gray. Radarr movie status is never
 * `ended`, so only `deleted` produces a triangle there.
 */
export function cornerColorFor(status: string): string | null {
  if (status === "ended") return CORNER_ENDED;
  if (status === "deleted") return CORNER_DELETED;
  return null;
}
