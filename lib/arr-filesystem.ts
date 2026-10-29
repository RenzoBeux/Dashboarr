/**
 * Server folder browsing for "Import from folder" (#470): the pure half of
 * Radarr's and Sonarr's `GET /api/v3/filesystem`, the endpoint their own web
 * UIs' file browser reads. Both run the same Servarr FileSystemLookupService,
 * so one shape covers both.
 *
 * Wire facts (verified against Radarr/Sonarr develop, FileSystemLookupService):
 * - `{ parent?, directories[], files[] }`; each entry is
 *   `{ type, name, path, ... }` with `type` "folder" | "drive" | "file" |
 *   "parent". With `includeFiles=false` only folders (and, on Windows, drives)
 *   come back.
 * - A directory `path` always ends with the host's separator.
 * - An empty `path` lists "/" on Linux and the drive list on Windows.
 * - `parent` is a path at any normal folder, `""` at a Windows drive root (the
 *   drive list is one level up) and absent at "/" or on the drive list itself.
 * - A folder that does not exist answers `{ parent }` with nothing in it.
 *
 * The app never joins paths itself: it only navigates to `path` and `parent`
 * values the server handed back, so Windows hosts and odd mount points work
 * the same way the *arr web UI does.
 */

export type ArrFsService = "radarr" | "sonarr";

export interface ArrFsEntry {
  type?: string;
  name?: string;
  path?: string;
}

/** Raw `GET /filesystem` response. */
export interface ArrFsResult {
  parent?: string | null;
  directories?: ArrFsEntry[];
  files?: ArrFsEntry[];
}

/** One row the folder browser can open. */
export interface ArrFolder {
  name: string;
  path: string;
  isDrive: boolean;
}

export interface ArrFolderListing {
  /**
   * Where "Up" goes: a server path, `""` for the server root / drive list, or
   * `null` when this is already the top and Up returns to the start view.
   */
  up: string | null;
  folders: ArrFolder[];
}

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Keeps what the browser can navigate into: every directory entry the server
 * gave a path for. Names fall back to the last path segment, so a record
 * without one still renders as something readable.
 */
export function normalizeFolderListing(
  raw: ArrFsResult | undefined | null,
): ArrFolderListing {
  const folders: ArrFolder[] = [];
  for (const entry of raw?.directories ?? []) {
    const path = typeof entry?.path === "string" ? entry.path : "";
    if (!path) continue;
    folders.push({
      name: entry.name?.trim() || lastSegment(path),
      path,
      isDrive: entry.type?.toLowerCase() === "drive",
    });
  }
  return {
    up: typeof raw?.parent === "string" ? raw.parent : null,
    folders,
  };
}

/**
 * Normalizes a hand-typed path the way the server's own directory paths look.
 *
 * Without the trailing separator the endpoint treats the text as a half-typed
 * name and lists its PARENT (autocomplete behaviour) whenever the folder does
 * not exist, so the screen would say "/data/movi" while showing "/data/". With
 * it, a missing folder answers empty instead. Windows is detected from a
 * backslash or a drive letter; everything else gets "/".
 */
export function withTrailingSeparator(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.endsWith("/") || trimmed.endsWith("\\")) return trimmed;
  const windows = trimmed.includes("\\") || /^[A-Za-z]:/.test(trimmed);
  return `${trimmed}${windows ? "\\" : "/"}`;
}

/** Same folder, regardless of whether either side carries the trailing separator. */
export function samePath(a: string, b: string): boolean {
  return withTrailingSeparator(a) === withTrailingSeparator(b);
}

/**
 * Whether a folder is worth scanning. The server root and the Windows drive
 * list are never a release folder, and scanning either would walk every disk.
 */
export function isScannableFolder(path: string | null): path is string {
  if (path === null) return false;
  const trimmed = path.trim();
  return trimmed !== "" && trimmed !== "/" && trimmed !== "\\";
}

/**
 * How long a disk rescan usually takes to show up: the command is queued, then
 * the scan reads the folder and imports what it finds. One re-check catches a
 * small local folder, the later ones a busy queue or a network share; anything
 * slower falls back to pull-to-refresh.
 */
export const DISK_RESCAN_RECHECK_MS = [4_000, 12_000, 30_000] as const;
