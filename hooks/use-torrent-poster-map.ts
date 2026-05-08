import { useMemo } from "react";
import { useRadarrQueue } from "@/hooks/use-radarr";
import { useSonarrQueue } from "@/hooks/use-sonarr";
import { getRadarrPoster } from "@/services/radarr-api";
import { getSonarrPoster } from "@/services/sonarr-api";

export interface TorrentPosterEntry {
  posterUrl: string | null;
  title: string;
  mediaType: "movie" | "tv";
  routeId: number; // movie.id or series.id, for navigation
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

  return useMemo(() => {
    const map = new Map<string, TorrentPosterEntry>();

    for (const item of radarrQueue?.records ?? []) {
      if (!item.downloadId || !item.movie) continue;
      map.set(item.downloadId.toLowerCase(), {
        posterUrl: getRadarrPoster(item.movie.images),
        title: item.movie.title,
        mediaType: "movie",
        routeId: item.movie.id,
      });
    }

    for (const item of sonarrQueue?.records ?? []) {
      if (!item.downloadId || !item.series) continue;
      map.set(item.downloadId.toLowerCase(), {
        posterUrl: getSonarrPoster(item.series.images),
        title: item.series.title,
        mediaType: "tv",
        routeId: item.series.id,
      });
    }

    return map;
  }, [radarrQueue, sonarrQueue]);
}
