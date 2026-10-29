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
 * Release identity of a "grabbed" record, as the backend's grab-format.ts
 * builds it: the downloadId, else `<movie|series>-<id>:<sourceTitle>`
 * (Blackhole clients return no download id, so upstream leaves it unset),
 * else the record id.
 */
function grabRelease(
  media: "movie" | "series",
  mediaId: number | undefined,
  r: { id: number; downloadId?: string; sourceTitle?: string },
): string {
  if (r.downloadId) return r.downloadId;
  if (mediaId !== undefined && r.sourceTitle) return `${media}-${mediaId}:${r.sourceTitle}`;
  return `history:${r.id}`;
}

export function radarrGrabRelease(r: RadarrHistoryRecord): string {
  return grabRelease("movie", r.movieId ?? r.movie?.id, r);
}

export function sonarrGrabRelease(r: SonarrHistoryRecord): string {
  return grabRelease("series", r.seriesId ?? r.series?.id, r);
}

/**
 * Group "grabbed" history records by release, keeping first-seen order.
 * Sonarr writes one record per episode of a grab, so a season pack is N
 * records of one release and should raise one notification, not N.
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

/**
 * Mirrors the backend's GRAB_REPEAT_WINDOW_MS: sightings of one release within
 * it are the same grab, further apart the release was grabbed again.
 */
export const GRAB_REPEAT_WINDOW_MS = 10 * 60 * 1000;

/** When a group's grab happened: its earliest record date, else `now`. */
export function grabGroupTime(group: readonly { date?: string }[], now: number): number {
  const times = group.map((r) => (r.date ? Date.parse(r.date) : NaN)).filter(Number.isFinite);
  return times.length > 0 ? Math.min(...times) : now;
}

/** What the grab watcher keeps between polls of one instance's history page. */
export interface GrabWatchState {
  seenIds: ReadonlySet<number>;
  /** Release -> when its last announced (or baselined) grab happened. */
  announced: ReadonlyMap<string, number>;
}

/**
 * One poll of the in-app grab watcher. Returns the new "grabbed" records worth
 * a notice and the state for the next poll; `prev` null seeds the baseline.
 * New ids alone aren't enough: Sonarr writes a pack's per-episode records one
 * by one, so a poll can catch half of them and the next poll the rest. Those
 * stragglers date from a grab already announced and stay quiet, while a later
 * re-grab of the same release (new records, a later date) notifies again.
 */
export function diffGrabRecords<R extends { id: number; eventType: string; date?: string }>(
  prev: GrabWatchState | null,
  records: readonly R[],
  releaseOf: (r: R) => string,
  now: number = Date.now(),
): { fresh: R[]; next: GrabWatchState } {
  const grabbed = records.filter((r) => r.eventType === "grabbed");
  // Only releases still on the page matter: a straggler of a grab that has
  // scrolled off can't appear above it.
  const onPage = new Set(grabbed.map(releaseOf));
  const announced = new Map([...(prev?.announced ?? [])].filter(([release]) => onPage.has(release)));
  const unseen = prev ? grabbed.filter((r) => !prev.seenIds.has(r.id)) : grabbed;
  const fresh: R[] = [];
  for (const group of groupGrabRecords(unseen, releaseOf)) {
    const release = releaseOf(group[0]);
    const at = grabGroupTime(group, now);
    const last = announced.get(release);
    if (last !== undefined && Math.abs(at - last) <= GRAB_REPEAT_WINDOW_MS) continue;
    announced.set(release, at);
    if (prev) fresh.push(...group);
  }
  return { fresh, next: { seenIds: new Set(grabbed.map((r) => r.id)), announced } };
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
  return groupGrabRecords(fresh, radarrGrabRelease).map(([r]) => {
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
  return groupGrabRecords(fresh, sonarrGrabRelease).map((group) => {
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
