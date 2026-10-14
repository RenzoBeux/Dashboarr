import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useItemsArrResolver } from "@/hooks/use-bazarr-link";
import { getMovies, getRadarrPoster } from "@/services/radarr-api";
import { getSeries, getSonarrPoster } from "@/services/sonarr-api";
import type { BazarrWantedMovie, BazarrWantedEpisode } from "@/lib/types";

export interface BazarrPosterEntry {
  posterUrl: string | null;
  title: string;
  mediaType: "movie" | "tv";
}

/** A Bazarr item tagged with the Bazarr instance it came from. */
export type FromBazarr<T> = T & { bazarrInstanceId: string };

/** Key of a movie/episode entry in the map `useBazarrPosters` returns. */
export function bazarrPosterKey(
  bazarrInstanceId: string,
  kind: "movie" | "episode",
  id: number,
): string {
  return `${bazarrInstanceId}:${kind}-${id}`;
}

/**
 * Resolves Bazarr wanted-items to posters from the Radarr / Sonarr library
 * caches. Bazarr movies carry `radarrId` and Bazarr episodes carry
 * `sonarrSeriesId` — ids that only mean something on the Radarr/Sonarr that
 * Bazarr instance is linked to (lib/bazarr-link.ts), so each item is looked up
 * in its own Bazarr's linked library; without a link, only a sole Radarr/Sonarr
 * is trusted (`itemsArrInstance` in lib/bazarr-link.ts). The library
 * queries share their keys with useRadarrMovies/useSonarrSeries, so a library
 * already loaded elsewhere costs nothing.
 */
export function useBazarrPosters(
  movies: FromBazarr<BazarrWantedMovie>[],
  episodes: FromBazarr<BazarrWantedEpisode>[],
): Map<string, BazarrPosterEntry> {
  const radarrFor = useItemsArrResolver("radarr", useShownBazarrs(movies));
  const sonarrFor = useItemsArrResolver("sonarr", useShownBazarrs(episodes));

  const radarrIds = unique(movies.map((m) => radarrFor(m.bazarrInstanceId)));
  const sonarrIds = unique(episodes.map((e) => sonarrFor(e.bazarrInstanceId)));

  const radarrLibs = useQueries({
    queries: radarrIds.map((id) => ({
      queryKey: ["radarr", id, "movies"],
      queryFn: () => getMovies(id),
    })),
  });
  const sonarrLibs = useQueries({
    queries: sonarrIds.map((id) => ({
      queryKey: ["sonarr", id, "series"],
      queryFn: () => getSeries(id),
    })),
  });

  const radarrData = radarrLibs.map((q) => q.data);
  const sonarrData = sonarrLibs.map((q) => q.data);
  // useQueries returns fresh arrays each render; this changes only when a
  // library actually reloads (or the set of libraries changes).
  const librariesVersion = [
    radarrIds.join(","),
    sonarrIds.join(","),
    ...[...radarrLibs, ...sonarrLibs].map((q) => q.dataUpdatedAt),
  ].join("|");

  // Indexing whole libraries is the expensive part; the wanted lists are
  // rebuilt by the card every render, so only this is worth memoizing.
  const { movieLibs, seriesLibs } = useMemo(
    () => ({
      movieLibs: new Map(
        radarrIds.map((id, i) => [id, new Map((radarrData[i] ?? []).map((m) => [m.id, m]))]),
      ),
      seriesLibs: new Map(
        sonarrIds.map((id, i) => [id, new Map((sonarrData[i] ?? []).map((s) => [s.id, s]))]),
      ),
    }),
    // radarrIds/sonarrIds and the data are covered by librariesVersion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [librariesVersion],
  );

  return useMemo(() => {
    const map = new Map<string, BazarrPosterEntry>();

    for (const wanted of movies) {
      const arrId = radarrFor(wanted.bazarrInstanceId);
      const movie = arrId ? movieLibs.get(arrId)?.get(wanted.radarrId) : undefined;
      if (!movie) continue;
      map.set(bazarrPosterKey(wanted.bazarrInstanceId, "movie", wanted.radarrId), {
        posterUrl: getRadarrPoster(movie.images),
        title: movie.title,
        mediaType: "movie",
      });
    }

    for (const wanted of episodes) {
      const arrId = sonarrFor(wanted.bazarrInstanceId);
      const series = arrId ? seriesLibs.get(arrId)?.get(wanted.sonarrSeriesId) : undefined;
      if (!series) continue;
      map.set(bazarrPosterKey(wanted.bazarrInstanceId, "episode", wanted.sonarrEpisodeId), {
        posterUrl: getSonarrPoster(series.images),
        title: series.title,
        mediaType: "tv",
      });
    }

    return map;
  }, [movies, episodes, radarrFor, sonarrFor, movieLibs, seriesLibs]);
}

/** The Bazarr instances `items` come from, stable while that set is. */
function useShownBazarrs(
  items: readonly { bazarrInstanceId: string }[],
): ReadonlySet<string> {
  const shownKey = unique(items.map((i) => i.bazarrInstanceId)).join(",");
  return useMemo(() => new Set(shownKey.split(",")), [shownKey]);
}

function unique(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}
