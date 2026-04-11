import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWantedMovies,
  getWantedEpisodes,
  getMovieHistory,
  getEpisodeHistory,
  getProviders,
  searchWantedMovie,
  searchWantedEpisode,
} from "@/services/bazarr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useBazarrEnabled() {
  return useConfigStore((s) => s.services.bazarr.enabled);
}

export function useBazarrWantedMovies() {
  const enabled = useBazarrEnabled();
  return useQuery({
    queryKey: ["bazarr", "wanted", "movies"],
    queryFn: () => getWantedMovies(0, 50),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useBazarrWantedEpisodes() {
  const enabled = useBazarrEnabled();
  return useQuery({
    queryKey: ["bazarr", "wanted", "episodes"],
    queryFn: () => getWantedEpisodes(0, 50),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useBazarrMovieHistory() {
  const enabled = useBazarrEnabled();
  return useQuery({
    queryKey: ["bazarr", "history", "movies"],
    queryFn: () => getMovieHistory(0, 25),
    enabled,
  });
}

export function useBazarrEpisodeHistory() {
  const enabled = useBazarrEnabled();
  return useQuery({
    queryKey: ["bazarr", "history", "episodes"],
    queryFn: () => getEpisodeHistory(0, 25),
    enabled,
  });
}

export function useBazarrProviders() {
  const enabled = useBazarrEnabled();
  return useQuery({
    queryKey: ["bazarr", "providers"],
    queryFn: getProviders,
    refetchInterval: POLLING_INTERVALS.serviceHealth,
    enabled,
  });
}

export function useSearchWantedMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (radarrid: number) => searchWantedMovie(radarrid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bazarr", "wanted", "movies"] });
    },
  });
}

export function useSearchWantedEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      seriesId,
      episodeId,
    }: {
      seriesId: number;
      episodeId: number;
    }) => searchWantedEpisode(seriesId, episodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bazarr", "wanted", "episodes"] });
    },
  });
}
