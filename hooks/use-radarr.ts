import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMovies,
  getMovie,
  getQueue,
  getWantedMissing,
  searchMovies,
  addMovie,
  deleteMovie,
  getQualityProfiles,
  getRootFolders,
} from "@/services/radarr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useRadarrEnabled() {
  return useConfigStore((s) => s.services.radarr.enabled);
}

export function useRadarrMovies() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "movies"],
    queryFn: getMovies,
    enabled,
  });
}

export function useRadarrMovie(id: number) {
  return useQuery({
    queryKey: ["radarr", "movie", id],
    queryFn: () => getMovie(id),
    enabled: id > 0,
  });
}

export function useRadarrQueue() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "queue"],
    queryFn: () => getQueue(1, 20, true),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useWantedMissing() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "wanted"],
    queryFn: () => getWantedMissing(1, 1),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useRadarrSearch(term: string) {
  return useQuery({
    queryKey: ["radarr", "search", term],
    queryFn: () => searchMovies(term),
    enabled: term.length >= 2,
  });
}

export function useAddMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addMovie,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radarr", "movies"] });
    },
  });
}

export function useDeleteMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteFiles = false,
    }: {
      id: number;
      deleteFiles?: boolean;
    }) => deleteMovie(id, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radarr", "movies"] });
    },
  });
}

export function useRadarrQualityProfiles() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "qualityProfiles"],
    queryFn: getQualityProfiles,
    enabled,
    staleTime: Infinity,
  });
}

export function useRadarrRootFolders() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "rootFolders"],
    queryFn: getRootFolders,
    enabled,
    staleTime: Infinity,
  });
}
