import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMovies,
  getMovie,
  getQueue,
  getHistory,
  getWantedMissing,
  getCalendar,
  searchMovies,
  addMovie,
  deleteMovie,
  searchForMovie,
  toggleMovieMonitored,
  updateMovie,
  changeMovieRootFolder,
  getQualityProfiles,
  getRootFolders,
  getTags,
  getReleasesForMovie,
  grabRadarrRelease,
} from "@/services/radarr-api";
import { toast, toastError } from "@/components/ui/toast";
import type { RadarrMovie } from "@/lib/types";
import { getMovieDetails, deleteMedia } from "@/services/overseerr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: every hook accepts an optional `instanceId`. When
// omitted the user's active Radarr is used (single-instance behavior); when
// passed, queries fan out to that specific instance with its own cache slot.

export function useRadarrMovies(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "movies"],
    queryFn: () => getMovies(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useRadarrCalendar(days = 30, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "calendar", days],
    queryFn: () => getCalendar(getDateOffset(0), getDateOffset(days), {}, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!id,
  });
}

export function useRadarrMovie(movieId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "movie", movieId],
    queryFn: () => getMovie(movieId, id ?? undefined),
    enabled: movieId > 0 && !!id,
  });
}

export function useRadarrQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "queue"],
    queryFn: () => getQueue(1, 20, true, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useRadarrHistory(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "history"],
    queryFn: () => getHistory(1, 50, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useWantedMissing(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "wanted"],
    queryFn: () => getWantedMissing(1, 1, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useRadarrSearch(term: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "search", term],
    queryFn: () => searchMovies(term, id ?? undefined),
    enabled: term.length >= 2 && !!id,
  });
}

export function useAddMovie(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: (movie: Parameters<typeof addMovie>[0]) =>
      addMovie(movie, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movies"] });
    },
  });
}

export function useDeleteMovie(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  // Overseerr cleanup runs against the active Overseerr instance; cross-stack
  // deletion is a UX nicety, not a contract.
  const overseerrEnabled = useConfigStore((s) => s.services.overseerr.enabled);
  return useMutation({
    mutationFn: async ({
      id: movieId,
      deleteFiles = false,
      tmdbId,
    }: {
      id: number;
      deleteFiles?: boolean;
      tmdbId?: number;
    }) => {
      await deleteMovie(movieId, deleteFiles, id ?? undefined);
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
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movies"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

export function useSearchForMovie(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: (movieId: number) => searchForMovie(movieId, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useToggleMovieMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: ({
      movieId,
      monitored,
    }: {
      movieId: number;
      monitored: boolean;
    }) => toggleMovieMonitored(movieId, monitored, id ?? undefined),
    onMutate: async ({ movieId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movies"] });
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movie", movieId] });

      const prevList = queryClient.getQueryData<RadarrMovie[]>(["radarr", id, "movies"]);
      const prevDetail = queryClient.getQueryData<RadarrMovie>([
        "radarr",
        id,
        "movie",
        movieId,
      ]);

      if (prevList) {
        queryClient.setQueryData<RadarrMovie[]>(
          ["radarr", id, "movies"],
          prevList.map((m) => (m.id === movieId ? { ...m, monitored } : m)),
        );
      }
      if (prevDetail) {
        queryClient.setQueryData<RadarrMovie>(
          ["radarr", id, "movie", movieId],
          { ...prevDetail, monitored },
        );
      }

      return { prevList, prevDetail };
    },
    onError: (err, { movieId }, context) => {
      if (context?.prevList) {
        queryClient.setQueryData(["radarr", id, "movies"], context.prevList);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(["radarr", id, "movie", movieId], context.prevDetail);
      }
      toastError("Failed to update monitoring", err);
    },
    onSettled: (_data, _err, { movieId }) => {
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movies"] });
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movie", movieId] });
    },
  });
}

export function useUpdateMovieQualityProfile(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: ({
      movieId,
      qualityProfileId,
    }: {
      movieId: number;
      qualityProfileId: number;
    }) => {
      const cached = queryClient.getQueryData<RadarrMovie>([
        "radarr",
        id,
        "movie",
        movieId,
      ]);
      if (!cached) throw new Error("Movie not loaded");
      return updateMovie(
        { ...cached, qualityProfileId },
        id ?? undefined,
      );
    },
    onMutate: async ({ movieId, qualityProfileId }) => {
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movie", movieId] });
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movies"] });

      const prevDetail = queryClient.getQueryData<RadarrMovie>([
        "radarr",
        id,
        "movie",
        movieId,
      ]);
      const prevList = queryClient.getQueryData<RadarrMovie[]>([
        "radarr",
        id,
        "movies",
      ]);

      if (prevDetail) {
        queryClient.setQueryData<RadarrMovie>(
          ["radarr", id, "movie", movieId],
          { ...prevDetail, qualityProfileId },
        );
      }
      if (prevList) {
        queryClient.setQueryData<RadarrMovie[]>(
          ["radarr", id, "movies"],
          prevList.map((m) =>
            m.id === movieId ? { ...m, qualityProfileId } : m,
          ),
        );
      }

      return { prevDetail, prevList };
    },
    onError: (err, { movieId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(
          ["radarr", id, "movie", movieId],
          context.prevDetail,
        );
      }
      if (context?.prevList) {
        queryClient.setQueryData(["radarr", id, "movies"], context.prevList);
      }
      toastError("Failed to update quality profile", err);
    },
    onSettled: (_data, _err, { movieId }) => {
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movie", movieId] });
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movies"] });
    },
  });
}

export function useUpdateMovieRootFolder(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: ({
      movieId,
      rootFolderPath,
      moveFiles,
    }: {
      movieId: number;
      rootFolderPath: string;
      moveFiles: boolean;
    }) => changeMovieRootFolder(movieId, rootFolderPath, moveFiles, id ?? undefined),
    onMutate: async ({ movieId, rootFolderPath }) => {
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movie", movieId] });
      await queryClient.cancelQueries({ queryKey: ["radarr", id, "movies"] });

      const prevDetail = queryClient.getQueryData<RadarrMovie>([
        "radarr",
        id,
        "movie",
        movieId,
      ]);
      const prevList = queryClient.getQueryData<RadarrMovie[]>([
        "radarr",
        id,
        "movies",
      ]);

      if (prevDetail) {
        queryClient.setQueryData<RadarrMovie>(
          ["radarr", id, "movie", movieId],
          { ...prevDetail, rootFolderPath },
        );
      }
      if (prevList) {
        queryClient.setQueryData<RadarrMovie[]>(
          ["radarr", id, "movies"],
          prevList.map((m) =>
            m.id === movieId ? { ...m, rootFolderPath } : m,
          ),
        );
      }

      return { prevDetail, prevList };
    },
    onError: (err, { movieId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(
          ["radarr", id, "movie", movieId],
          context.prevDetail,
        );
      }
      if (context?.prevList) {
        queryClient.setQueryData(["radarr", id, "movies"], context.prevList);
      }
      toastError("Failed to update root folder", err);
    },
    onSettled: (_data, _err, { movieId }) => {
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movie", movieId] });
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "movies"] });
    },
  });
}

export function useRadarrQualityProfiles(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "qualityProfiles"],
    queryFn: () => getQualityProfiles(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useRadarrRootFolders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "rootFolders"],
    queryFn: () => getRootFolders(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useRadarrTags(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "tags"],
    queryFn: () => getTags(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

// Interactive search is expensive (live indexer hit, often 30s+) — don't
// auto-retry on transient failure, and keep the cache warm long enough that
// back-navigation doesn't re-trigger.
export function useRadarrReleases(movieId: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("radarr", instanceId);
  return useQuery({
    queryKey: ["radarr", id, "releases", movieId],
    queryFn: () => getReleasesForMovie(movieId, id ?? undefined),
    enabled: enabled && movieId > 0 && !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useGrabRadarrRelease(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("radarr", instanceId);
  return useMutation({
    mutationFn: ({ guid, indexerId }: { guid: string; indexerId: number }) =>
      grabRadarrRelease(guid, indexerId, id ?? undefined),
    onSuccess: () => {
      toast("Sent to download client");
      queryClient.invalidateQueries({ queryKey: ["radarr", id, "queue"] });
    },
    onError: (err) => {
      toastError("Failed to grab release", err);
    },
  });
}
