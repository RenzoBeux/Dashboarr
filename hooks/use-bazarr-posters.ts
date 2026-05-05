import { useMemo } from "react";
import { useRadarrMovies } from "@/hooks/use-radarr";
import { useSonarrSeries } from "@/hooks/use-sonarr";
import { getRadarrPoster } from "@/services/radarr-api";
import { getSonarrPoster } from "@/services/sonarr-api";
import type { BazarrWantedMovie, BazarrWantedEpisode } from "@/lib/types";

export interface BazarrPosterEntry {
  posterUrl: string | null;
  title: string;
  mediaType: "movie" | "tv";
}

/**
 * Resolves Bazarr wanted-items to posters by reusing the in-memory Radarr /
 * Sonarr caches. Bazarr movies carry `radarrId` and Bazarr episodes carry
 * `sonarrSeriesId`, so no extra network calls are needed when both *arrs are
 * configured. Returns an empty map (graceful fallback) if neither cache is
 * populated yet.
 *
 * Map keys mirror the dashboard's preview-item keys:
 *   `movie-${radarrId}` / `episode-${sonarrEpisodeId}`
 */
export function useBazarrPosters(
  movies: BazarrWantedMovie[],
  episodes: BazarrWantedEpisode[],
): Map<string, BazarrPosterEntry> {
  const { data: radarrMovies } = useRadarrMovies();
  const { data: sonarrSeries } = useSonarrSeries();

  return useMemo(() => {
    const map = new Map<string, BazarrPosterEntry>();

    if (radarrMovies) {
      const byId = new Map(radarrMovies.map((m) => [m.id, m]));
      for (const wanted of movies) {
        const movie = byId.get(wanted.radarrId);
        if (!movie) continue;
        map.set(`movie-${wanted.radarrId}`, {
          posterUrl: getRadarrPoster(movie.images),
          title: movie.title,
          mediaType: "movie",
        });
      }
    }

    if (sonarrSeries) {
      const byId = new Map(sonarrSeries.map((s) => [s.id, s]));
      for (const wanted of episodes) {
        const series = byId.get(wanted.sonarrSeriesId);
        if (!series) continue;
        map.set(`episode-${wanted.sonarrEpisodeId}`, {
          posterUrl: getSonarrPoster(series.images),
          title: series.title,
          mediaType: "tv",
        });
      }
    }

    return map;
  }, [movies, episodes, radarrMovies, sonarrSeries]);
}
