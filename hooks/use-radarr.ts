import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMovies,
  getMovie,
  getQueue,
  getWantedMissing,
  getCalendar,
  searchMovies,
  addMovie,
  deleteMovie,
  getQualityProfiles,
  getRootFolders,
} from "@/services/radarr-api";
import { getMovieDetails, deleteMedia } from "@/services/overseerr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";

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

export function useRadarrCalendar() {
  const enabled = useRadarrEnabled();
  return useQuery({
    queryKey: ["radarr", "calendar"],
    queryFn: () => getCalendar(getDateOffset(0), getDateOffset(30)),
    refetchInterval: POLLING_INTERVALS.calendar,
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
  const overseerrEnabled = useConfigStore((s) => s.services.overseerr.enabled);
  return useMutation({
    mutationFn: async ({
      id,
      deleteFiles = false,
      tmdbId,
    }: {
      id: number;
      deleteFiles?: boolean;
      tmdbId?: number;
    }) => {
      await deleteMovie(id, deleteFiles);
      // Clear Overseerr media entry so the movie can be re-requested
      if (tmdbId && overseerrEnabled) {
        try {
          const details = await getMovieDetails(tmdbId);
          if (details.mediaInfo?.id) {
            await deleteMedia(details.mediaInfo.id);
          }
        } catch {
          // Non-critical — don't block Radarr delete if Overseerr cleanup fails
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radarr", "movies"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
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
