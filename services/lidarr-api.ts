import { serviceRequest } from "@/lib/http-client";
import type {
  LidarrArtist,
  LidarrAlbum,
  LidarrTrack,
  LidarrQueue,
  LidarrWantedMissing,
  LidarrImage,
  LidarrArtistSearchResult,
} from "@/lib/types";

// --- Image helpers ---
//
// Artists carry a "poster" cover (like Radarr movies / Sonarr series); albums
// carry a "cover" image. Prefer remoteUrl (immutable CDN) over url (local proxy).

export function getLidarrArtistPoster(
  images: LidarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const poster = images.find((i) => i.coverType === "poster");
  return poster?.remoteUrl || poster?.url || null;
}

export function getLidarrArtistFanart(
  images: LidarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const fanart = images.find((i) => i.coverType === "fanart");
  return fanart?.remoteUrl || fanart?.url || null;
}

export function getLidarrAlbumCover(
  images: LidarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const cover = images.find((i) => i.coverType === "cover");
  return cover?.remoteUrl || cover?.url || null;
}

// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific Lidarr instance. When omitted, the user's
// active Lidarr instance is used (legacy single-instance behavior).

// --- Artists ---

export function getArtists(instanceId?: string): Promise<LidarrArtist[]> {
  return serviceRequest<LidarrArtist[]>("lidarr", "/artist", { instanceId });
}

export function getArtist(id: number, instanceId?: string): Promise<LidarrArtist> {
  return serviceRequest<LidarrArtist>("lidarr", `/artist/${id}`, { instanceId });
}

// --- Albums ---

export function getAlbums(
  artistId: number,
  instanceId?: string,
): Promise<LidarrAlbum[]> {
  return serviceRequest<LidarrAlbum[]>("lidarr", "/album", {
    params: { artistId },
    instanceId,
  });
}

export function getAlbum(id: number, instanceId?: string): Promise<LidarrAlbum> {
  return serviceRequest<LidarrAlbum>("lidarr", `/album/${id}`, { instanceId });
}

// --- Tracks ---

export function getTracks(
  albumId: number,
  instanceId?: string,
): Promise<LidarrTrack[]> {
  return serviceRequest<LidarrTrack[]>("lidarr", "/track", {
    params: { albumId },
    instanceId,
  });
}

// --- Queue ---

export function getQueue(
  page = 1,
  pageSize = 20,
  instanceId?: string,
): Promise<LidarrQueue> {
  return serviceRequest<LidarrQueue>("lidarr", "/queue", {
    params: { page, pageSize, includeArtist: true, includeAlbum: true },
    instanceId,
  });
}

// --- Wanted / Missing ---

export function getWantedMissing(
  page = 1,
  pageSize = 1,
  instanceId?: string,
): Promise<LidarrWantedMissing> {
  return serviceRequest<LidarrWantedMissing>("lidarr", "/wanted/missing", {
    params: {
      page,
      pageSize,
      sortKey: "releaseDate",
      sortDirection: "descending",
      includeArtist: true,
    },
    instanceId,
  });
}

// Walks every page of the wanted/missing list. getWantedMissing above is the
// cheap count-only call used for dashboard badges; this one fetches page 1 to
// learn the total, then pulls the remaining pages in parallel and concatenates
// them so the Wanted view shows the complete list, not a single page (mirrors
// Radarr's getAllWantedMissing — see issue #156).
export async function getAllWantedMissing(
  instanceId?: string,
): Promise<LidarrWantedMissing> {
  const pageSize = 100;
  const first = await getWantedMissing(1, pageSize, instanceId);
  const totalPages = Math.max(1, Math.ceil(first.totalRecords / pageSize));
  if (totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      getWantedMissing(i + 2, pageSize, instanceId),
    ),
  );
  const records = rest.reduce(
    (acc, page) => acc.concat(page.records),
    [...first.records],
  );
  return { ...first, pageSize: records.length, records };
}

// --- Search (lookup for adding) ---

export function searchArtists(
  term: string,
  instanceId?: string,
): Promise<LidarrArtistSearchResult[]> {
  return serviceRequest<LidarrArtistSearchResult[]>("lidarr", "/artist/lookup", {
    params: { term },
    instanceId,
  });
}

// --- Add Artist ---

// Lidarr artist monitor strategy at add time. "all" monitors every album,
// "future"/"latest"/"first" scope to subsets, "none" adds unmonitored.
export type LidarrMonitorOption =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "first"
  | "latest"
  | "none";

export function addArtist(
  artist: {
    foreignArtistId: string;
    artistName: string;
    qualityProfileId: number;
    metadataProfileId: number;
    rootFolderPath: string;
    monitored?: boolean;
    searchForMissingAlbums?: boolean;
    monitor?: LidarrMonitorOption;
    tags?: number[];
  },
  instanceId?: string,
): Promise<LidarrArtist> {
  return serviceRequest<LidarrArtist>("lidarr", "/artist", {
    method: "POST",
    body: JSON.stringify({
      foreignArtistId: artist.foreignArtistId,
      artistName: artist.artistName,
      qualityProfileId: artist.qualityProfileId,
      metadataProfileId: artist.metadataProfileId,
      rootFolderPath: artist.rootFolderPath,
      monitored: artist.monitored ?? true,
      tags: artist.tags ?? [],
      addOptions: {
        monitor: artist.monitor ?? "all",
        searchForMissingAlbums: artist.searchForMissingAlbums ?? true,
      },
    }),
    instanceId,
  });
}

// --- Delete Artist ---

export function deleteArtist(
  id: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("lidarr", `/artist/${id}`, {
    method: "DELETE",
    params: { deleteFiles },
    instanceId,
  });
}

// --- Search Commands ---

// Auto-search every monitored album of an artist (Lidarr "Search Monitored").
export function searchArtist(artistId: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("lidarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "ArtistSearch", artistId }),
    instanceId,
  });
}

// Auto-search specific albums.
export function searchAlbums(albumIds: number[], instanceId?: string): Promise<void> {
  return serviceRequest<void>("lidarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "AlbumSearch", albumIds }),
    instanceId,
  });
}

// Searches every monitored missing album — the equivalent of Lidarr's Wanted ›
// Missing › "Search All" button (mirrors Radarr's searchAllMissingMovies).
export function searchAllMissingAlbums(instanceId?: string): Promise<void> {
  return serviceRequest<void>("lidarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "MissingAlbumSearch" }),
    instanceId,
  });
}

// --- Toggle Monitored ---

// Artist monitoring goes through the bulk editor endpoint (same rationale as
// Radarr's /movie/editor — server-side derivation, no stale full body).
export function toggleArtistMonitored(
  artistId: number,
  monitored: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("lidarr", "/artist/editor", {
    method: "PUT",
    body: JSON.stringify({ artistIds: [artistId], monitored }),
    instanceId,
  });
}

// Album monitoring has its own dedicated bulk endpoint.
export function toggleAlbumMonitored(
  albumId: number,
  monitored: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("lidarr", "/album/monitor", {
    method: "PUT",
    body: JSON.stringify({ albumIds: [albumId], monitored }),
    instanceId,
  });
}

// --- Change Root Folder (via bulk editor endpoint) ---
//
// Same rationale as Radarr's changeMovieRootFolder: the editor endpoint derives
// the move destination from `rootFolderPath` server-side and rewrites `path`
// consistently. Send only ids + rootFolderPath + moveFiles. moveFiles:false
// changes the root without moving files; moveFiles:true also moves them.
export function changeArtistRootFolder(
  artistId: number,
  rootFolderPath: string,
  moveFiles: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("lidarr", "/artist/editor", {
    method: "PUT",
    body: JSON.stringify({ artistIds: [artistId], rootFolderPath, moveFiles }),
    instanceId,
  });
}

// --- Update Artist (full PUT) ---
//
// Lidarr expects the entire artist resource on PUT. Our `LidarrArtist` type is a
// subset, but because we always spread the cached GET result through, every
// runtime field is preserved. Used for quality/metadata profile changes.
export function updateArtist(
  artist: LidarrArtist,
  instanceId?: string,
): Promise<LidarrArtist> {
  return serviceRequest<LidarrArtist>("lidarr", `/artist/${artist.id}`, {
    method: "PUT",
    body: JSON.stringify(artist),
    instanceId,
  });
}

// --- Quality Profiles ---

export interface LidarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(
  instanceId?: string,
): Promise<LidarrQualityProfile[]> {
  return serviceRequest<LidarrQualityProfile[]>("lidarr", "/qualityprofile", {
    instanceId,
  });
}

// --- Metadata Profiles (Lidarr-specific: which release types to monitor) ---

export interface LidarrMetadataProfile {
  id: number;
  name: string;
}

export function getMetadataProfiles(
  instanceId?: string,
): Promise<LidarrMetadataProfile[]> {
  return serviceRequest<LidarrMetadataProfile[]>("lidarr", "/metadataprofile", {
    instanceId,
  });
}

// --- Root Folders ---

export interface LidarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export function getRootFolders(instanceId?: string): Promise<LidarrRootFolder[]> {
  return serviceRequest<LidarrRootFolder[]>("lidarr", "/rootfolder", { instanceId });
}

// --- Tags ---

export interface LidarrTag {
  id: number;
  label: string;
}

export function getTags(instanceId?: string): Promise<LidarrTag[]> {
  return serviceRequest<LidarrTag[]>("lidarr", "/tag", { instanceId });
}
