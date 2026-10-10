import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useConfigStore } from "@/store/config-store";
import { useBazarrLinkEntries } from "@/hooks/use-bazarr-link";
import { getMovies, getRadarrPoster } from "@/services/radarr-api";
import { getSeries, getSonarrPoster } from "@/services/sonarr-api";
import type { ArrKind } from "@/lib/bazarr-link";
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
 * in its own Bazarr's linked library. A Bazarr with no link (and not switched
 * off) falls back to the active instance, the pre-link behavior. The library
 * queries share their keys with useRadarrMovies/useSonarrSeries, so a library
 * already loaded elsewhere costs nothing.
 */
export function useBazarrPosters(
  movies: FromBazarr<BazarrWantedMovie>[],
  episodes: FromBazarr<BazarrWantedEpisode>[],
): Map<string, BazarrPosterEntry> {
  const radarrFor = useArrForBazarr("radarr");
  const sonarrFor = useArrForBazarr("sonarr");

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
  // library actually reloads.
  const librariesVersion = [...radarrLibs, ...sonarrLibs]
    .map((q) => q.dataUpdatedAt)
    .join(",");

  return useMemo(() => {
    const map = new Map<string, BazarrPosterEntry>();

    const movieLibs = new Map(
      radarrIds.map((id, i) => [id, new Map((radarrData[i] ?? []).map((m) => [m.id, m]))]),
    );
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

    const seriesLibs = new Map(
      sonarrIds.map((id, i) => [id, new Map((sonarrData[i] ?? []).map((s) => [s.id, s]))]),
    );
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
    // radarrData/sonarrData are covered by librariesVersion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, episodes, radarrFor, sonarrFor, librariesVersion]);
}

/** bazarrId → the arr instance to read its items from, or undefined. */
function useArrForBazarr(kind: ArrKind): (bazarrId: string) => string | undefined {
  const entries = useBazarrLinkEntries(kind);
  const activeId = useConfigStore((s) => s.activeInstance[kind] ?? undefined);
  // Entries are rebuilt each render; key the lookup on their content.
  const signature = entries
    .map((e) => `${e.bazarrId}=${e.state.how}:${e.state.arrId ?? ""}`)
    .join(",");
  return useMemo(() => {
    const byBazarr = new Map(entries.map((e) => [e.bazarrId, e.state]));
    return (bazarrId: string) => {
      const state = byBazarr.get(bazarrId);
      if (state?.arrId) return state.arrId;
      return state?.how === "off" ? undefined : activeId;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, activeId]);
}

function unique(ids: (string | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}
