import { useMemo } from "react";
import { useRadarrQueue, useRadarrHistory } from "@/hooks/use-radarr";
import { useSonarrQueue, useSonarrHistory } from "@/hooks/use-sonarr";
import { getRadarrPoster } from "@/services/radarr-api";
import { getSonarrPoster } from "@/services/sonarr-api";
import { getJSON, setJSON } from "@/store/storage";
import { STORAGE_KEYS } from "@/lib/constants";

export interface TorrentPosterEntry {
  posterUrl: string | null;
  title: string;
  mediaType: "movie" | "tv";
  routeId: number; // movie.id or series.id, for navigation
}

// Sticky hash→entry mapping. The *arr queue only lists in-flight downloads, so
// without persistence the Downloads widget cover would vanish the moment
// Radarr/Sonarr imports a finished file (#88). The cache is populated
// additively from the live queue, the *arr history (covers recent completions
// from previous sessions), and any prior persisted snapshot — so seeding
// torrents keep their posters across app launches.
const stickyPosterCache = new Map<string, TorrentPosterEntry>();
let cacheHydrated = false;

function hydrateCacheOnce(): void {
  if (cacheHydrated) return;
  cacheHydrated = true;
  const stored = getJSON<Record<string, TorrentPosterEntry>>(
    STORAGE_KEYS.torrentPosterCache,
  );
  if (!stored) return;
  for (const [hash, entry] of Object.entries(stored)) {
    if (entry && typeof entry === "object") {
      stickyPosterCache.set(hash, entry);
    }
  }
}

function persistCache(): void {
  setJSON(
    STORAGE_KEYS.torrentPosterCache,
    Object.fromEntries(stickyPosterCache),
  );
}

/**
 * Strict torrent → media mapping. qBittorrent's torrent hash equals the *arr
 * `downloadId` for any torrent grabbed via Radarr or Sonarr — so we can look
 * up posters deterministically without parsing torrent names.
 *
 * Returns a map keyed by lowercased hash. Returns an empty map if neither
 * *arr is enabled (graceful degradation: tiles fall back to the icon).
 */
export function useTorrentPosterMap(): Map<string, TorrentPosterEntry> {
  const { data: radarrQueue } = useRadarrQueue();
  const { data: sonarrQueue } = useSonarrQueue();
  const { data: radarrHistory } = useRadarrHistory();
  const { data: sonarrHistory } = useSonarrHistory();

  return useMemo(() => {
    hydrateCacheOnce();
    const sizeBefore = stickyPosterCache.size;

    for (const item of radarrQueue?.records ?? []) {
      if (!item.downloadId || !item.movie) continue;
      stickyPosterCache.set(item.downloadId.toLowerCase(), {
        posterUrl: getRadarrPoster(item.movie.images),
        title: item.movie.title,
        mediaType: "movie",
        routeId: item.movie.id,
      });
    }

    for (const item of sonarrQueue?.records ?? []) {
      if (!item.downloadId || !item.series) continue;
      stickyPosterCache.set(item.downloadId.toLowerCase(), {
        posterUrl: getSonarrPoster(item.series.images),
        title: item.series.title,
        mediaType: "tv",
        routeId: item.series.id,
      });
    }

    // History backfills the cold-start gap: torrents that finished in a
    // previous session won't appear in the queue, but their grab/import event
    // is still in history with the same `downloadId` (== torrent hash). Only
    // records that already include the embedded movie/series get used; older
    // events without the embed are skipped.
    for (const record of radarrHistory?.records ?? []) {
      if (!record.downloadId || !record.movie) continue;
      const key = record.downloadId.toLowerCase();
      if (stickyPosterCache.has(key)) continue;
      stickyPosterCache.set(key, {
        posterUrl: getRadarrPoster(record.movie.images),
        title: record.movie.title,
        mediaType: "movie",
        routeId: record.movie.id,
      });
    }

    for (const record of sonarrHistory?.records ?? []) {
      if (!record.downloadId || !record.series) continue;
      const key = record.downloadId.toLowerCase();
      if (stickyPosterCache.has(key)) continue;
      stickyPosterCache.set(key, {
        posterUrl: getSonarrPoster(record.series.images),
        title: record.series.title,
        mediaType: "tv",
        routeId: record.series.id,
      });
    }

    if (stickyPosterCache.size > sizeBefore) persistCache();

    return new Map(stickyPosterCache);
  }, [radarrQueue, sonarrQueue, radarrHistory, sonarrHistory]);
}
