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
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function useBazarrWantedMovies(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bazarr", instanceId);
  return useQuery({
    queryKey: ["bazarr", id, "wanted", "movies"],
    queryFn: () => getWantedMovies(0, 50, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useBazarrWantedEpisodes(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bazarr", instanceId);
  return useQuery({
    queryKey: ["bazarr", id, "wanted", "episodes"],
    queryFn: () => getWantedEpisodes(0, 50, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useBazarrMovieHistory(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bazarr", instanceId);
  return useQuery({
    queryKey: ["bazarr", id, "history", "movies"],
    queryFn: () => getMovieHistory(0, 25, id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useBazarrEpisodeHistory(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bazarr", instanceId);
  return useQuery({
    queryKey: ["bazarr", id, "history", "episodes"],
    queryFn: () => getEpisodeHistory(0, 25, id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useBazarrProviders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("bazarr", instanceId);
  return useQuery({
    queryKey: ["bazarr", id, "providers"],
    queryFn: () => getProviders(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.serviceHealth,
    enabled: enabled && !!id,
  });
}

export function useSearchWantedMovie(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bazarr", instanceId);
  return useMutation({
    mutationFn: (radarrid: number) => searchWantedMovie(radarrid, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bazarr", id, "wanted", "movies"] });
    },
  });
}

export function useSearchWantedEpisode(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("bazarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      episodeId,
    }: {
      seriesId: number;
      episodeId: number;
    }) => searchWantedEpisode(seriesId, episodeId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bazarr", id, "wanted", "episodes"] });
    },
  });
}
