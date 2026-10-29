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
 * `GET /manualimport?folder=` is the same scan over any folder on the *arr host
 * (#470); its files carry no downloadId, so the payloads below simply omit it.
 *
 * Kept pure (no React, no network) so the payload shapes — the part that fails
 * silently against a real server — are unit-testable.
 */

export type ManualImportService = "radarr" | "sonarr";

/**
 * Where the files come from: a stuck download (#306), or any folder on the
 * *arr host (#470). The two differ in the /manualimport lookup and, more
 * importantly, in what the command does with the source files.
 */
export type ManualImportSource =
  | { kind: "download"; downloadId: string }
  | { kind: "folder"; folder: string };

/** The ManualImport command's `importMode` (ImportMode: Auto, Move, Copy). */
export type ArrImportMode = "auto" | "move" | "copy";

/** The two modes a folder import may use. "copy" hardlinks when *arr is set to. */
export type FolderImportMode = Exclude<ArrImportMode, "auto">;

/**
 * The importMode to send for a source.
 *
 * A download keeps "auto", which lets *arr follow the download client (copy
 * while a torrent still seeds, move otherwise). A folder must never send it:
 * "auto" only copies when there is a download-client item that can't move, and
 * a folder import has none, so on the server it means MOVE
 * (ImportApprovedMovie / ImportApprovedEpisodes). The user picks instead, the
 * same choice Radarr's and Sonarr's own folder import forces.
 */
export function resolveImportMode(
  source: ManualImportSource,
  chosen: FolderImportMode | undefined,
): ArrImportMode {
  if (source.kind === "download") return "auto";
  if (!chosen) throw new Error("Choose whether to move or copy the files.");
  return chosen;
}

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
 * The starting mapping for the manual-import screen: what *arr already
 * resolved by itself, plus which files begin selected.
 *
 * The destination is screen-wide — one series or movie for the whole download
 * folder — so a file's episode ids are only carried over when that file matched
 * THAT destination. A folder holding two series would otherwise pair one file's
 * episode ids with the other file's seriesId, and the command would import into
 * the wrong show. Files matched to something else start unmapped, for the user
 * to map by hand or leave out.
 */
export function seedMapping(candidates: ManualImportCandidate[]): {
  mediaId?: number;
  episodeIds: Record<number, number[]>;
  included: Record<number, boolean>;
} {
  const mediaId = candidates.find((c) => c.mediaId)?.mediaId;
  const onTarget =
    mediaId === undefined ? [] : candidates.filter((c) => c.mediaId === mediaId);

  // Radarr has no per-file mapping to imply intent, so inclusion is explicit:
  // start from the files it matched, or the largest one when it matched none
  // (sample and subtitle files are exactly what the user deselects).
  const seedIncluded = onTarget.length
    ? onTarget
    : candidates.slice().sort((a, b) => b.size - a.size).slice(0, 1);

  return {
    mediaId,
    episodeIds: Object.fromEntries(
      onTarget.filter((c) => c.episodeIds.length).map((c) => [c.id, c.episodeIds]),
    ),
    included: Object.fromEntries(seedIncluded.map((c) => [c.id, true])),
  };
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

// The rejection a folder scan puts on a file whose title is not in the library
// (ManualImportService.ProcessFile, ImportRejectionReason.UnknownMovie /
// UnknownSeries). Server-side English constants, not localized.
const UNKNOWN_TITLE_REJECTION: Record<ManualImportService, string> = {
  radarr: "Unknown Movie",
  sonarr: "Unknown Series",
};

/**
 * Whether any file was refused because *arr has no such movie or series. A
 * folder can hold a title the user never added; the screen can only map files
 * to titles already in the library, so it points them at Search instead.
 */
export function hasUnknownTitle(
  service: ManualImportService,
  candidates: ManualImportCandidate[],
): boolean {
  const reason = UNKNOWN_TITLE_REJECTION[service];
  return candidates.some((c) => c.rejections.includes(reason));
}

/**
 * Files *arr matched to some title other than the chosen destination that the
 * import will leave out. The screen imports into one title per pass, so a
 * folder holding two movies needs a second pass for the other one. A file the
 * user mapped by hand anyway is in `rows` and not counted.
 */
export function countMatchedElsewhere(
  candidates: ManualImportCandidate[],
  mediaId: number | undefined,
  rows: ManualImportRow[],
): number {
  if (mediaId === undefined) return 0;
  const importing = new Set(rows.map((row) => row.candidate.id));
  return candidates.filter(
    (c) =>
      c.mediaId !== undefined && c.mediaId !== mediaId && !importing.has(c.id),
  ).length;
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
