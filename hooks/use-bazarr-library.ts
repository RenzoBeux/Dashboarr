import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getBazarrMovies,
  getBazarrSeriesList,
  getEpisodeHistory,
  getMovieHistory,
} from "@/services/bazarr-api";
import { historyStreamsToPage, mergeHistoryStreams } from "@/lib/bazarr-history";

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
  const movieItems = useMemo(
    () => (filter === "episodes" ? [] : (movies.data?.pages.flatMap((p) => p.data) ?? [])),
    [filter, movies.data],
  );
  const episodeItems = useMemo(
    () => (filter === "movies" ? [] : (episodes.data?.pages.flatMap((p) => p.data) ?? [])),
    [filter, episodes.data],
  );
  // A stream whose first page hasn't come yet has no cutoff to hold the
  // other one back: showing the faster stream in full would drop most of it
  // again once the slower one lands. Wait for both.
  const waiting =
    (filter !== "episodes" && !movies.data && !movies.error) ||
    (filter !== "movies" && !episodes.data && !episodes.error);
  // Memoized on the loaded pages, so the list only re-renders when they change.
  const entries = useMemo(
    () => (waiting ? [] : mergeHistoryStreams(movieItems, episodeItems, more)),
    // `more` derives from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waiting, movieItems, episodeItems, more.movies, more.episodes],
  );

  return {
    entries,
    isLoading: waiting,
    // Only the streams on screen: a stream the filter turned off keeps its
    // last error.
    error:
      (filter !== "episodes" ? movies.error : null) ??
      (filter !== "movies" ? episodes.error : null) ??
      null,
    hasMore: more.movies || more.episodes,
    isFetchingMore:
      (filter !== "episodes" && movies.isFetchingNextPage) ||
      (filter !== "movies" && episodes.isFetchingNextPage),
    loadMore: () => {
      const page = historyStreamsToPage(movieItems, episodeItems, more);
      if (page.movies && !movies.isFetchingNextPage) void movies.fetchNextPage();
      if (page.episodes && !episodes.isFetchingNextPage) void episodes.fetchNextPage();
    },
  };
}
