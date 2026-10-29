import { formatBytes } from "@/lib/utils";
import { normalizeRadarrHistory, normalizeSonarrHistory } from "@/lib/arr-history";
import type { RadarrHistoryRecord, SonarrHistoryRecord } from "@/lib/types";

/**
 * Local-notification copy for the in-app grab watchers (#464). Mirrors the
 * backend's src/push/grab-format.ts so a grab reads the same whether the
 * backend pushed it or the open app raised it: title "Movie grabbed" /
 * "Episode grabbed", body one line `<subject> · <quality> · <size> ·
 * <indexer>`, skipping the parts the record doesn't carry.
 */

export interface EpisodeRef {
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * One episode: "S01E02 - Title". Several in one season (a season pack):
 * "S01E01-E10". Several seasons: "S01-S03". Entries without a season or
 * episode number are ignored; nothing usable gives "".
 */
export function formatEpisodeSpan(episodes: readonly EpisodeRef[]): string {
  const valid = episodes.filter(
    (e): e is EpisodeRef & { seasonNumber: number; episodeNumber: number } =>
      typeof e.seasonNumber === "number" && typeof e.episodeNumber === "number",
  );
  if (valid.length === 0) return "";
  const seasons = [...new Set(valid.map((e) => e.seasonNumber))].sort((a, b) => a - b);
  if (seasons.length > 1) {
    return `S${pad2(seasons[0])}-S${pad2(seasons[seasons.length - 1])}`;
  }
  const numbers = [...new Set(valid.map((e) => e.episodeNumber))].sort((a, b) => a - b);
  const season = `S${pad2(seasons[0])}`;
  if (numbers.length > 1) {
    return `${season}E${pad2(numbers[0])}-E${pad2(numbers[numbers.length - 1])}`;
  }
  const title = valid.find((e) => e.title)?.title;
  return `${season}E${pad2(numbers[0])}${title ? ` - ${title}` : ""}`;
}

export interface GrabBodyParts {
  subject: string;
  quality?: string;
  sizeBytes?: number;
  indexer?: string;
}

export function formatGrabBody({ subject, quality, sizeBytes, indexer }: GrabBodyParts): string {
  const size = sizeBytes && sizeBytes > 0 ? formatBytes(sizeBytes) : undefined;
  return [subject, quality, size, indexer].filter((p): p is string => !!p).join(" · ");
}

/**
 * Group "grabbed" history records by downloadId, keeping first-seen order.
 * Sonarr writes one record per episode of a grab, so a season pack is N
 * records sharing a downloadId and should raise one notification, not N.
 */
export function groupGrabRecords<T extends { id: number; downloadId?: string }>(
  records: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const key = r.downloadId ? `dl:${r.downloadId}` : `id:${r.id}`;
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()];
}

export interface GrabNotice {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** One notice per release among newly seen Radarr "grabbed" records. */
export function radarrGrabNotices(
  fresh: readonly RadarrHistoryRecord[],
  instanceId: string,
): GrabNotice[] {
  return groupGrabRecords(fresh).map(([r]) => {
    const entry = normalizeRadarrHistory(r);
    const subject = r.movie?.title
      ? r.movie.year
        ? `${r.movie.title} (${r.movie.year})`
        : r.movie.title
      : (r.sourceTitle ?? "");
    return {
      title: "Movie grabbed",
      body: formatGrabBody({
        subject,
        quality: entry.qualityName,
        sizeBytes: entry.sizeBytes,
        indexer: entry.indexer,
      }),
      data: { type: "radarr", movieId: r.movieId ?? r.movie?.id, historyId: r.id, instanceId },
    };
  });
}

/** One notice per release among newly seen Sonarr "grabbed" records. */
export function sonarrGrabNotices(
  fresh: readonly SonarrHistoryRecord[],
  instanceId: string,
): GrabNotice[] {
  return groupGrabRecords(fresh).map((group) => {
    const r = group[0];
    const entry = normalizeSonarrHistory(r);
    const span = formatEpisodeSpan(group.map((g) => g.episode ?? {}));
    const subject = r.series?.title
      ? span
        ? `${r.series.title} ${span}`
        : r.series.title
      : (r.sourceTitle ?? "");
    return {
      title: "Episode grabbed",
      body: formatGrabBody({
        subject,
        quality: entry.qualityName,
        sizeBytes: entry.sizeBytes,
        indexer: entry.indexer,
      }),
      data: { type: "sonarr", seriesId: r.seriesId ?? r.series?.id, historyId: r.id, instanceId },
    };
  });
}
