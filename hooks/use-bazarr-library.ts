import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getBazarrMovies,
  getBazarrSeriesList,
  getEpisodeHistory,
  getMovieHistory,
} from "@/services/bazarr-api";
import { mergeHistoryStreams } from "@/lib/bazarr-history";

/**
 * The Bazarr tab's data: the whole movie/series library and paged history.
 * Like the subtitle hooks, they take the Bazarr instance explicitly.
 */

const HISTORY_PAGE = 50;
// The full library is one big request; it only changes when subtitles do,
// which the job watcher invalidates explicitly.
const LIBRARY_STALE_MS = 5 * 60_000;

export const bazarrLibraryKey = (bazarrId: string, kind: "movies" | "series") =>
  ["bazarr", bazarrId, "library", kind] as const;

export function useBazarrMovieLibrary(bazarrId: string | null, enabled = true) {
  return useQuery({
    queryKey: bazarrLibraryKey(bazarrId ?? "", "movies"),
    queryFn: () => getBazarrMovies(bazarrId!),
    enabled: !!bazarrId && enabled,
    staleTime: LIBRARY_STALE_MS,
  });
}

export function useBazarrSeriesLibrary(bazarrId: string | null, enabled = true) {
  return useQuery({
    queryKey: bazarrLibraryKey(bazarrId ?? "", "series"),
    queryFn: () => getBazarrSeriesList(bazarrId!),
    enabled: !!bazarrId && enabled,
    staleTime: LIBRARY_STALE_MS,
  });
}

function useHistoryStream(bazarrId: string | null, kind: "movies" | "episodes", enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["bazarr", bazarrId ?? "", "history", kind, "paged"],
    queryFn: ({ pageParam }) =>
      (kind === "movies" ? getMovieHistory : getEpisodeHistory)(
        pageParam,
        HISTORY_PAGE,
        bazarrId!,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.data.length, 0);
      return loaded < last.total && last.data.length > 0 ? loaded : undefined;
    },
    enabled: !!bazarrId && enabled,
  });
}

/**
 * Movie and episode history merged newest first. `filter` decides which
 * streams load; `loadMore` pages whichever stream the merged list is waiting
 * on.
 */
export function useBazarrHistory(
  bazarrId: string | null,
  filter: "all" | "movies" | "episodes",
) {
  const movies = useHistoryStream(bazarrId, "movies", filter !== "episodes");
  const episodes = useHistoryStream(bazarrId, "episodes", filter !== "movies");

  const movieItems = filter === "episodes" ? [] : (movies.data?.pages.flatMap((p) => p.data) ?? []);
  const episodeItems = filter === "movies" ? [] : (episodes.data?.pages.flatMap((p) => p.data) ?? []);
  const more = {
    movies: filter !== "episodes" && !!movies.hasNextPage,
    episodes: filter !== "movies" && !!episodes.hasNextPage,
  };
  const entries = mergeHistoryStreams(movieItems, episodeItems, more);

  return {
    entries,
    isLoading:
      (filter !== "episodes" && movies.isLoading) || (filter !== "movies" && episodes.isLoading),
    error: movies.error ?? episodes.error ?? null,
    hasMore: more.movies || more.episodes,
    isFetchingMore: movies.isFetchingNextPage || episodes.isFetchingNextPage,
    loadMore: () => {
      if (more.movies && !movies.isFetchingNextPage) void movies.fetchNextPage();
      if (more.episodes && !episodes.isFetchingNextPage) void episodes.fetchNextPage();
    },
  };
}
