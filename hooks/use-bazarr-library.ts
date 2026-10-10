import { useMemo } from "react";
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
    queryFn: ({ signal }) => getBazarrMovies(bazarrId!, signal),
    enabled: !!bazarrId && enabled,
    staleTime: LIBRARY_STALE_MS,
  });
}

export function useBazarrSeriesLibrary(bazarrId: string | null, enabled = true) {
  return useQuery({
    queryKey: bazarrLibraryKey(bazarrId ?? "", "series"),
    queryFn: ({ signal }) => getBazarrSeriesList(bazarrId!, signal),
    enabled: !!bazarrId && enabled,
    staleTime: LIBRARY_STALE_MS,
  });
}

function useHistoryStream(bazarrId: string | null, kind: "movies" | "episodes", enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["bazarr", bazarrId ?? "", "history", kind, "paged"],
    queryFn: ({ pageParam, signal }) =>
      (kind === "movies" ? getMovieHistory : getEpisodeHistory)(
        pageParam,
        HISTORY_PAGE,
        bazarrId!,
        signal,
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

  const more = {
    movies: filter !== "episodes" && !!movies.hasNextPage,
    episodes: filter !== "movies" && !!episodes.hasNextPage,
  };
  // Memoized on the loaded pages, so the list only re-renders when they change.
  const entries = useMemo(
    () =>
      mergeHistoryStreams(
        filter === "episodes" ? [] : (movies.data?.pages.flatMap((p) => p.data) ?? []),
        filter === "movies" ? [] : (episodes.data?.pages.flatMap((p) => p.data) ?? []),
        more,
      ),
    // `more` derives from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, movies.data, episodes.data, movies.hasNextPage, episodes.hasNextPage],
  );

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
