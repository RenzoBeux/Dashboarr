import type {
  ArrQualityModel,
  RadarrManualImportItem,
  SonarrManualImportItem,
} from "@/lib/types";

/**
 * Manual import — the app-side equivalent of Radarr's and Sonarr's own
 * Interactive/Manual Import screen (#306).
 *
 * `GET /manualimport?downloadId=` returns the files *arr found for a completed
 * download plus whatever it managed to match them to. One-tap force import
 * (#325) only works when *arr matched everything itself; when the release is
 * named in a way it can't parse, `series`/`movie`/`episodes` come back empty
 * and the mapping has to be supplied by hand. That is what this module models:
 * a normalized candidate shape both services share, and the two `files[]`
 * payloads their `ManualImport` command takes.
 *
 * Kept pure (no React, no network) so the payload shapes — the part that fails
 * silently against a real server — are unit-testable.
 */

export type ManualImportService = "radarr" | "sonarr";

/** A candidate file from `GET /manualimport`, normalized across both services. */
export interface ManualImportCandidate {
  /** Candidate id; unique within one /manualimport response, used as the key. */
  id: number;
  /** Absolute path on the *arr host — the field the command imports by. */
  path: string;
  folderName?: string;
  /** File name for display: the relative path, else the basename of `path`. */
  name: string;
  size: number;
  /** What *arr matched on its own: a Sonarr series id / a Radarr movie id. */
  mediaId?: number;
  mediaTitle?: string;
  /** Sonarr only — its guess at the season, and the episodes it resolved. */
  seasonNumber?: number;
  episodeIds: number[];
  episodeFileId?: number;
  releaseType?: string;
  /** Parsed off the file name; absent when *arr could not parse one. */
  quality?: ArrQualityModel;
  languages: { id: number; name: string }[];
  releaseGroup?: string;
  indexerFlags: number;
  /** Why *arr refused to import the file, deduped. */
  rejections: string[];
}

/** One file plus the destination it will be imported to. */
export interface ManualImportRow {
  candidate: ManualImportCandidate;
  /** Sonarr: the series id. Radarr: the movie id. */
  mediaId: number;
  quality: ArrQualityModel;
  /** Sonarr only; ignored by the Radarr payload. */
  episodeIds: number[];
}

/** `files[]` entry of Sonarr's ManualImport command. */
export interface SonarrManualImportFile {
  path: string;
  folderName?: string;
  seriesId: number;
  episodeIds: number[];
  quality: ArrQualityModel;
  languages: { id: number; name: string }[];
  releaseGroup?: string;
  indexerFlags: number;
  releaseType?: string;
  episodeFileId?: number;
  downloadId?: string;
}

/** `files[]` entry of Radarr's ManualImport command. */
export interface RadarrManualImportFile {
  path: string;
  folderName?: string;
  movieId: number;
  quality: ArrQualityModel;
  languages: { id: number; name: string }[];
  releaseGroup?: string;
  indexerFlags: number;
  downloadId?: string;
}

// `relativePath` is what both web UIs show; `path` is absolute and `name` is
// only set on some records, so both are fallbacks rather than the first choice.
function fileName(item: {
  relativePath?: string;
  path?: string;
  name?: string;
}): string {
  if (item.relativePath) return item.relativePath;
  const base = (item.path ?? "").split(/[\\/]/).pop();
  return base || item.name || item.path || "";
}

function rejectionReasons(
  rejections: { reason: string }[] | undefined,
): string[] {
  const out: string[] = [];
  for (const entry of rejections ?? []) {
    const reason = entry?.reason?.trim();
    if (reason && !out.includes(reason)) out.push(reason);
  }
  return out;
}

/**
 * Candidates without a `path` are dropped: the command imports by path, so a
 * pathless record could never be sent and would only render as a dead row.
 */
export function toSonarrCandidates(
  items: SonarrManualImportItem[] | undefined,
): ManualImportCandidate[] {
  return (items ?? [])
    .filter((item) => !!item.path)
    .map((item) => ({
      id: item.id,
      path: item.path!,
      folderName: item.folderName,
      name: fileName(item),
      size: item.size ?? 0,
      mediaId: item.series?.id,
      mediaTitle: item.series?.title,
      seasonNumber: item.seasonNumber,
      episodeIds: (item.episodes ?? []).map((e) => e.id),
      episodeFileId: item.episodeFileId,
      releaseType: item.releaseType,
      quality: item.quality,
      languages: item.languages ?? [],
      releaseGroup: item.releaseGroup,
      indexerFlags: item.indexerFlags ?? 0,
      rejections: rejectionReasons(item.rejections),
    }));
}

export function toRadarrCandidates(
  items: RadarrManualImportItem[] | undefined,
): ManualImportCandidate[] {
  return (items ?? [])
    .filter((item) => !!item.path)
    .map((item) => ({
      id: item.id,
      path: item.path!,
      folderName: item.folderName,
      name: fileName(item),
      size: item.size ?? 0,
      mediaId: item.movie?.id,
      mediaTitle: item.movie?.title,
      episodeIds: [],
      quality: item.quality,
      languages: item.languages ?? [],
      releaseGroup: item.releaseGroup,
      indexerFlags: item.indexerFlags ?? 0,
      rejections: rejectionReasons(item.rejections),
    }));
}

/**
 * The rows *arr already resolved by itself — exactly what one-tap force import
 * (#325) sends. A Sonarr file needs a series, at least one episode and a parsed
 * quality; a Radarr file needs a movie and a quality. Anything short of that
 * has to be mapped on the manual-import screen instead.
 */
export function autoRows(
  service: ManualImportService,
  candidates: ManualImportCandidate[],
): ManualImportRow[] {
  const rows: ManualImportRow[] = [];
  for (const candidate of candidates) {
    if (!candidate.mediaId || !candidate.quality) continue;
    if (service === "sonarr" && candidate.episodeIds.length === 0) continue;
    rows.push({
      candidate,
      mediaId: candidate.mediaId,
      quality: candidate.quality,
      episodeIds: candidate.episodeIds,
    });
  }
  return rows;
}

/**
 * Payload mirroring Sonarr's web UI (InteractiveImportModalContent). The
 * per-file `downloadId` is what ties the import back to the queue item, so the
 * grab leaves the queue instead of lingering as a second stuck entry.
 */
export function sonarrImportFiles(
  rows: ManualImportRow[],
  downloadId?: string,
): SonarrManualImportFile[] {
  return rows.map((row) => ({
    path: row.candidate.path,
    folderName: row.candidate.folderName,
    seriesId: row.mediaId,
    episodeIds: row.episodeIds,
    quality: row.quality,
    languages: row.candidate.languages,
    releaseGroup: row.candidate.releaseGroup,
    indexerFlags: row.candidate.indexerFlags,
    releaseType: row.candidate.releaseType,
    episodeFileId: row.candidate.episodeFileId,
    downloadId,
  }));
}

export function radarrImportFiles(
  rows: ManualImportRow[],
  downloadId?: string,
): RadarrManualImportFile[] {
  return rows.map((row) => ({
    path: row.candidate.path,
    folderName: row.candidate.folderName,
    movieId: row.mediaId,
    quality: row.quality,
    languages: row.candidate.languages,
    releaseGroup: row.candidate.releaseGroup,
    indexerFlags: row.candidate.indexerFlags,
    downloadId,
  }));
}

/** "WEBDL-1080p", with the proper/repack revision appended when there is one. */
export function qualityLabel(quality: ArrQualityModel | undefined): string {
  if (!quality?.quality?.name) return "Unknown quality";
  const version = quality.revision?.version ?? 1;
  if (quality.revision?.isRepack) return `${quality.quality.name} REPACK`;
  if (version > 1) return `${quality.quality.name} PROPER`;
  return quality.quality.name;
}

/**
 * A quality picked from `/qualitydefinition` carries no revision, so give it
 * the neutral one the parser would have produced for a first release.
 */
export function qualityFromDefinition(quality: {
  id: number;
  name: string;
  source?: string;
  resolution?: number;
}): ArrQualityModel {
  return { quality, revision: { version: 1, real: 0, isRepack: false } };
}
