import type { PushEvent } from "../types.js";
import type { RadarrHistoryRecord } from "../services/radarr.js";
import type { SonarrHistoryRecord } from "../services/sonarr.js";

/**
 * "Movie grabbed" / "Episode grabbed" pushes (#464), shared by the Radarr and
 * Sonarr webhooks (eventType "Grab") and the history pollers ("grabbed"
 * records) so both sources produce the same copy and the same dedupe key.
 * Pure: no DB, no env, so it is unit-testable without Fastify.
 *
 * Body is one line, `<subject> · <quality> · <size> · <indexer>`, skipping
 * whatever the source didn't send (every webhook field is optional upstream:
 * Newtonsoft drops nulls).
 *
 * Dedupe key: `<kind>:grabbed:<instanceId | "any">:<release>`, where release
 * is the downloadId, or `<movie|series>-<id>:<release title>` when the client
 * returned none (see grabReleaseFallback). A grab and the later import of the
 * same release share the downloadId, so the grab needs its own `grabbed`
 * segment or it would claim the key the "Movie downloaded" push uses. The
 * webhook (once it resolves the instance) and the poller build the identical
 * string, so the two sources collapse into one push.
 */

/** Same output as the app's formatBytes (lib/utils.ts): 1024 base, 1 decimal. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export interface EpisodeRef {
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * One episode: "S01E02 - Title". Several in one season (a partial or full
 * season pack): "S01E01-E10". Several seasons: "S01-S03". Entries without a
 * season or episode number are ignored; nothing usable gives "".
 */
export function formatEpisodeSpan(episodes: readonly EpisodeRef[]): string {
  const valid = episodes.filter(
    (e): e is EpisodeRef & { seasonNumber: number; episodeNumber: number } =>
      typeof e.seasonNumber === "number" && typeof e.episodeNumber === "number",
  );
  if (valid.length === 0) return "";
  const seasons = [...new Set(valid.map((e) => e.seasonNumber))].sort((a, b) => a - b);
  if (seasons.length > 1) {
    return `S${pad2(seasons[0]!)}-S${pad2(seasons[seasons.length - 1]!)}`;
  }
  const numbers = [...new Set(valid.map((e) => e.episodeNumber))].sort((a, b) => a - b);
  const season = `S${pad2(seasons[0]!)}`;
  if (numbers.length > 1) {
    return `${season}E${pad2(numbers[0]!)}-E${pad2(numbers[numbers.length - 1]!)}`;
  }
  const title = valid.find((e) => e.title)?.title;
  return `${season}E${pad2(numbers[0]!)}${title ? ` - ${title}` : ""}`;
}

export interface GrabBodyParts {
  subject: string;
  quality?: string;
  sizeBytes?: number;
  indexer?: string;
}

export function formatGrabBody({ subject, quality, sizeBytes, indexer }: GrabBodyParts): string {
  const size =
    typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes > 0
      ? formatBytes(sizeBytes)
      : undefined;
  return [subject, quality, size, indexer].filter((p): p is string => !!p).join(" · ");
}

export function grabDedupeKey(kind: "radarr" | "sonarr", namespace: string, release: string): string {
  return `${kind}:grabbed:${namespace}:${release}`;
}

/**
 * Release identity for a grab without a downloadId. Upstream only sets
 * DownloadId when the download client returns one, and the Blackhole clients
 * return none. The Grab webhook's release.releaseTitle and the history
 * record's sourceTitle are both Release.Title, so this is the same string from
 * either source. Undefined when the media id or the title is missing.
 */
export function grabReleaseFallback(
  media: "movie" | "series",
  mediaId: number | undefined,
  releaseTitle: string | undefined,
): string | undefined {
  return mediaId !== undefined && releaseTitle ? `${media}-${mediaId}:${releaseTitle}` : undefined;
}

function movieSubject(movie: { title?: string; year?: number } | undefined, fallback = ""): string {
  if (!movie?.title) return fallback;
  return movie.year ? `${movie.title} (${movie.year})` : movie.title;
}

function seriesSubject(seriesTitle: string | undefined, episodes: readonly EpisodeRef[], fallback = ""): string {
  if (!seriesTitle) return fallback;
  const span = formatEpisodeSpan(episodes);
  return span ? `${seriesTitle} ${span}` : seriesTitle;
}

// ---------------- Webhooks ----------------

/** `release` on the Radarr/Sonarr Grab webhook (WebhookRelease upstream). */
export interface WebhookGrabRelease {
  quality?: string;
  releaseTitle?: string;
  indexer?: string;
  size?: number;
}

export interface RadarrGrabWebhook {
  movie?: { id?: number; title?: string; year?: number };
  release?: WebhookGrabRelease;
  downloadId?: string;
}

export interface SonarrGrabWebhook {
  series?: { id?: number; title?: string };
  episodes?: (EpisodeRef & { id?: number })[];
  release?: WebhookGrabRelease;
  downloadId?: string;
}

/**
 * Push for a Radarr Grab webhook, or null when the payload names no movie.
 * `instanceId` is the resolved instance (undefined = kind-only attribution).
 */
export function buildRadarrGrabWebhookEvent(
  payload: RadarrGrabWebhook,
  instanceId: string | undefined,
  prefix: string,
): PushEvent | null {
  const movie = payload.movie;
  if (!movie?.title) return null;
  const release = payload.release;
  return {
    category: "radarrGrabbed",
    title: `${prefix}Movie grabbed`,
    body: formatGrabBody({
      subject: movieSubject(movie),
      quality: release?.quality,
      sizeBytes: release?.size,
      indexer: release?.indexer,
    }),
    data: { type: "radarr", movieId: movie.id, instanceId },
    dedupeKey: grabDedupeKey(
      "radarr",
      instanceId ?? "any",
      payload.downloadId || grabReleaseFallback("movie", movie.id, release?.releaseTitle) || `movie-${movie.id}:`,
    ),
  };
}

/**
 * Push for a Sonarr Grab webhook, or null when the payload names no series.
 * A season pack lists every episode it covers, so the subject spans them.
 */
export function buildSonarrGrabWebhookEvent(
  payload: SonarrGrabWebhook,
  instanceId: string | undefined,
  prefix: string,
): PushEvent | null {
  const series = payload.series;
  if (!series?.title) return null;
  const episodes = payload.episodes ?? [];
  const release = payload.release;
  return {
    category: "sonarrGrabbed",
    title: `${prefix}Episode grabbed`,
    body: formatGrabBody({
      subject: seriesSubject(series.title, episodes),
      quality: release?.quality,
      sizeBytes: release?.size,
      indexer: release?.indexer,
    }),
    data: {
      type: "sonarr",
      seriesId: series.id,
      episodeId: episodes[0]?.id,
      instanceId,
    },
    dedupeKey: grabDedupeKey(
      "sonarr",
      instanceId ?? "any",
      payload.downloadId || grabReleaseFallback("series", series.id, release?.releaseTitle) || `series-${series.id}:`,
    ),
  };
}

// ---------------- History poller ----------------

/** Release identity of a Radarr "grabbed" record: the grab webhook's key suffix. */
export function radarrGrabRelease(r: RadarrHistoryRecord): string {
  return r.downloadId || grabReleaseFallback("movie", r.movieId ?? r.movie?.id, r.sourceTitle) || `history:${r.id}`;
}

/**
 * Release identity of a Sonarr "grabbed" record. Every episode record of one
 * grab carries the same downloadId (or none, with the same sourceTitle).
 */
export function sonarrGrabRelease(r: SonarrHistoryRecord): string {
  return r.downloadId || grabReleaseFallback("series", r.seriesId ?? r.series?.id, r.sourceTitle) || `history:${r.id}`;
}

/**
 * Group "grabbed" history records by release, keeping first-seen order.
 * Sonarr writes one record per episode of a grab (a season pack is N records
 * of one release), and the user wants one push per release, not per episode.
 */
export function groupGrabRecords<T>(records: readonly T[], releaseOf: (r: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const key = releaseOf(r);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()];
}

function historySize(data: Record<string, string | undefined> | undefined): number | undefined {
  const size = data?.size ? Number(data.size) : NaN;
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

/** Pushes for newly seen Radarr "grabbed" records (already diffed by the caller). */
export function buildRadarrHistoryGrabEvents(
  fresh: readonly RadarrHistoryRecord[],
  instanceId: string,
  prefix: string,
): PushEvent[] {
  return groupGrabRecords(fresh, radarrGrabRelease).map((group) => {
    const r = group[0]!;
    return {
      category: "radarrGrabbed",
      title: `${prefix}Movie grabbed`,
      body: formatGrabBody({
        subject: movieSubject(r.movie, r.sourceTitle ?? ""),
        quality: r.quality?.quality?.name,
        sizeBytes: historySize(r.data),
        indexer: r.data?.indexer,
      }),
      data: { type: "radarr", movieId: r.movieId ?? r.movie?.id, instanceId },
      dedupeKey: grabDedupeKey("radarr", instanceId, radarrGrabRelease(r)),
    };
  });
}

/** Pushes for newly seen Sonarr "grabbed" records, one per release. */
export function buildSonarrHistoryGrabEvents(
  fresh: readonly SonarrHistoryRecord[],
  instanceId: string,
  prefix: string,
): PushEvent[] {
  return groupGrabRecords(fresh, sonarrGrabRelease).map((group) => {
    const r = group[0]!;
    const episodes = group.map((g) => g.episode ?? {});
    return {
      category: "sonarrGrabbed",
      title: `${prefix}Episode grabbed`,
      body: formatGrabBody({
        subject: seriesSubject(r.series?.title, episodes, r.sourceTitle ?? ""),
        quality: r.quality?.quality?.name,
        sizeBytes: historySize(r.data),
        indexer: r.data?.indexer,
      }),
      data: { type: "sonarr", seriesId: r.seriesId ?? r.series?.id, instanceId },
      dedupeKey: grabDedupeKey("sonarr", instanceId, sonarrGrabRelease(r)),
    };
  });
}
