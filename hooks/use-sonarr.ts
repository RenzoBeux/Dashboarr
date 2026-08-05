import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getSeries,
  getSeriesById,
  getEpisodes,
  getEpisodeFiles,
  deleteEpisodeFile,
  deleteEpisodeFiles,
  getCalendar,
  getQueue,
  getHistory,
  getEpisodeHistory,
  searchSeries,
  addSeries,
  deleteSeries,
  toggleEpisodeMonitored,
  toggleSeriesMonitored,
  updateSeries,
  changeSeriesRootFolder,
  searchForSeries,
  searchForEpisodes,
  searchForSeason,
  searchAllMissingEpisodes,
  getQualityProfiles,
  getRootFolders,
  getTags,
  getReleasesForEpisode,
  getReleasesForSeason,
  grabSonarrRelease,
} from "@/services/sonarr-api";
import { toast, toastError } from "@/components/ui/toast";
import type { SonarrSeries } from "@/lib/types";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: see use-qbittorrent.ts and use-radarr.ts for the
// rationale. Each hook accepts an optional `instanceId`; omitted = active.

export function useSonarrSeries(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "series"],
    queryFn: () => getSeries(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useSonarrSeriesById(seriesId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "series", seriesId],
    queryFn: () => getSeriesById(seriesId, id ?? undefined),
    enabled: seriesId > 0 && !!id,
  });
}

export function useSonarrEpisodes(seriesId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "episodes", seriesId],
    queryFn: () => getEpisodes(seriesId, id ?? undefined),
    enabled: seriesId > 0 && !!id,
  });
}

export function useSonarrEpisodeFiles(seriesId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "episodeFiles", seriesId],
    queryFn: () => getEpisodeFiles(seriesId, id ?? undefined),
    enabled: seriesId > 0 && !!id,
  });
}

export function useSonarrCalendar(days = 7, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "calendar", days],
    // Padded ±1 day: episodes are placed on the local day of airDateUtc, so a
    // boundary airing whose UTC day differs from the local day would fall
    // outside the server-side range filter. Consumers re-bound to [0, days].
    queryFn: () =>
      getCalendar(getDateOffset(-1), getDateOffset(days + 1), {}, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!id,
  });
}

export function useSonarrQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "queue"],
    // Args must stay identical to sonarrArrQueueAdapter.fetchQueue — the
    // dashboard widget and the queue-issues banner share this cache entry.
    queryFn: () => getQueue(1, 100, true, true, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

// Per-episode history for the episode History screen. Scoped cache key so it
// never collides with the global useSonarrHistory (page-1 activity feed).
export function useSonarrEpisodeHistory(episodeId: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "history", "episode", episodeId],
    queryFn: () => getEpisodeHistory(episodeId, id ?? undefined),
    enabled: enabled && episodeId > 0 && !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useSonarrHistory(instanceId?: string, active = true) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "history"],
    queryFn: () => getHistory(1, 50, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id && active,
  });
}

export function useSonarrSearch(term: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "search", term],
    queryFn: () => searchSeries(term, id ?? undefined),
    enabled: enabled && term.length >= 2 && !!id,
    // See useRadarrSearch: hold the last results while the next term loads (#304).
    placeholderData: keepPreviousData,
  });
}

export function useAddSeries(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: (series: Parameters<typeof addSeries>[0]) =>
      addSeries(series, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
    },
  });
}

export function useDeleteSeries(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      id: seriesId,
      deleteFiles = false,
    }: {
      id: number;
      deleteFiles?: boolean;
    }) => deleteSeries(seriesId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
    },
  });
}

export function useToggleEpisodeMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      episodeId,
      monitored,
    }: {
      episodeId: number;
      monitored: boolean;
    }) => toggleEpisodeMonitored(episodeId, monitored, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "episodes"] });
    },
  });
}

export function useDeleteEpisodeFile(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: (episodeFileId: number) =>
      deleteEpisodeFile(episodeFileId, id ?? undefined),
    onSuccess: () => {
      invalidateAfterFileDelete(queryClient, id);
      toast("Episode file deleted");
    },
    onError: (err) => toastError("Delete failed", err),
  });
}

// Season-level "delete files": one bulk request for every file in the season.
// The episodes stay in the library and flip back to missing, same as the
// single-file delete.
export function useDeleteEpisodeFiles(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: (episodeFileIds: number[]) =>
      deleteEpisodeFiles(episodeFileIds, id ?? undefined),
    onSuccess: (_data, episodeFileIds) => {
      invalidateAfterFileDelete(queryClient, id);
      toast(
        `${episodeFileIds.length} episode file${
          episodeFileIds.length !== 1 ? "s" : ""
        } deleted`,
      );
    },
    onError: (err) => toastError("Delete failed", err),
  });
}

// Refresh the episode list, file map, and series stats (file counts).
function invalidateAfterFileDelete(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string | null,
) {
  queryClient.invalidateQueries({ queryKey: ["sonarr", id, "episodes"] });
  queryClient.invalidateQueries({ queryKey: ["sonarr", id, "episodeFiles"] });
  queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
}

export function useSearchForSeries(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: (seriesId: number) =>
      searchForSeries(seriesId, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useSearchForEpisodes(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: (episodeIds: number[]) =>
      searchForEpisodes(episodeIds, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useSearchForSeason(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      seasonNumber,
    }: {
      seriesId: number;
      seasonNumber: number;
    }) => searchForSeason(seriesId, seasonNumber, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useSearchAllMissingEpisodes(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: () => searchAllMissingEpisodes(id ?? undefined),
    onSuccess: () => toast("Searching all missing episodes"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useToggleSeriesMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      monitored,
    }: {
      seriesId: number;
      monitored: boolean;
    }) => toggleSeriesMonitored(seriesId, monitored, id ?? undefined),
    onMutate: async ({ seriesId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["sonarr", id, "series"] });
      await queryClient.cancelQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });

      const prevList = queryClient.getQueryData<SonarrSeries[]>([
        "sonarr",
        id,
        "series",
      ]);
      const prevDetail = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);

      if (prevList) {
        queryClient.setQueryData<SonarrSeries[]>(
          ["sonarr", id, "series"],
          prevList.map((s) => (s.id === seriesId ? { ...s, monitored } : s)),
        );
      }
      if (prevDetail) {
        queryClient.setQueryData<SonarrSeries>(
          ["sonarr", id, "series", seriesId],
          { ...prevDetail, monitored },
        );
      }

      return { prevList, prevDetail };
    },
    onError: (err, { seriesId }, context) => {
      if (context?.prevList) {
        queryClient.setQueryData(["sonarr", id, "series"], context.prevList);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(
          ["sonarr", id, "series", seriesId],
          context.prevDetail,
        );
      }
      toastError("Failed to update monitoring", err);
    },
    onSettled: (_data, _err, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
      queryClient.invalidateQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
    },
  });
}

// Generic series field update (quality profile, series type, season folder,
// monitor-new-seasons, …): forwards the cached series with `fields` overridden
// via full PUT and mirrors the change optimistically into both caches.
export function useUpdateSeriesFields(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      fields,
    }: {
      seriesId: number;
      fields: Partial<SonarrSeries>;
      errorLabel?: string;
    }) => {
      const cached = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      if (!cached) throw new Error("Series not loaded");
      return updateSeries({ ...cached, ...fields }, id ?? undefined);
    },
    onMutate: async ({ seriesId, fields }) => {
      await queryClient.cancelQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
      await queryClient.cancelQueries({ queryKey: ["sonarr", id, "series"] });

      const prevDetail = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      const prevList = queryClient.getQueryData<SonarrSeries[]>([
        "sonarr",
        id,
        "series",
      ]);

      if (prevDetail) {
        queryClient.setQueryData<SonarrSeries>(
          ["sonarr", id, "series", seriesId],
          { ...prevDetail, ...fields },
        );
      }
      if (prevList) {
        queryClient.setQueryData<SonarrSeries[]>(
          ["sonarr", id, "series"],
          prevList.map((s) => (s.id === seriesId ? { ...s, ...fields } : s)),
        );
      }

      return { prevDetail, prevList };
    },
    onError: (err, { seriesId, errorLabel }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(
          ["sonarr", id, "series", seriesId],
          context.prevDetail,
        );
      }
      if (context?.prevList) {
        queryClient.setQueryData(["sonarr", id, "series"], context.prevList);
      }
      toastError(errorLabel ?? "Failed to update series", err);
    },
    onSettled: (_data, _err, { seriesId }) => {
      queryClient.invalidateQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
    },
  });
}

/**
 * Season monitoring lives on the series resource, so the toggle is the same
 * full series PUT as any other field edit — Sonarr's own web UI flips
 * `seasons[n].monitored` and PUTs /series/{id}. Server-side,
 * `SeriesService.UpdateSeries` notices the changed season and calls
 * `SetEpisodeMonitoredBySeason`, so every episode in that season follows and
 * the episode list has to be refetched on top of the usual series caches.
 */
export function useToggleSeasonMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  const update = useUpdateSeriesFields(instanceId);

  return {
    isPending: update.isPending,
    mutate: ({
      seriesId,
      seasonNumber,
      monitored,
    }: {
      seriesId: number;
      seasonNumber: number;
      monitored: boolean;
    }) => {
      const cached = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      if (!cached) return;
      update.mutate(
        {
          seriesId,
          fields: {
            seasons: cached.seasons.map((s) =>
              s.seasonNumber === seasonNumber ? { ...s, monitored } : s,
            ),
          },
          errorLabel: "Failed to update monitoring",
        },
        {
          onSettled: () =>
            queryClient.invalidateQueries({
              queryKey: ["sonarr", id, "episodes", seriesId],
            }),
        },
      );
    },
  };
}

export function useUpdateSeriesRootFolder(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      rootFolderPath,
      moveFiles,
    }: {
      seriesId: number;
      rootFolderPath: string;
      moveFiles: boolean;
    }) => changeSeriesRootFolder(seriesId, rootFolderPath, moveFiles, id ?? undefined),
    onMutate: async ({ seriesId, rootFolderPath }) => {
      await queryClient.cancelQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
      await queryClient.cancelQueries({ queryKey: ["sonarr", id, "series"] });

      const prevDetail = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      const prevList = queryClient.getQueryData<SonarrSeries[]>([
        "sonarr",
        id,
        "series",
      ]);

      if (prevDetail) {
        queryClient.setQueryData<SonarrSeries>(
          ["sonarr", id, "series", seriesId],
          { ...prevDetail, rootFolderPath },
        );
      }
      if (prevList) {
        queryClient.setQueryData<SonarrSeries[]>(
          ["sonarr", id, "series"],
          prevList.map((s) =>
            s.id === seriesId ? { ...s, rootFolderPath } : s,
          ),
        );
      }

      return { prevDetail, prevList };
    },
    onError: (err, { seriesId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(
          ["sonarr", id, "series", seriesId],
          context.prevDetail,
        );
      }
      if (context?.prevList) {
        queryClient.setQueryData(["sonarr", id, "series"], context.prevList);
      }
      toastError("Failed to update root folder", err);
    },
    onSettled: (_data, _err, { seriesId }) => {
      queryClient.invalidateQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
    },
  });
}

export function useSonarrQualityProfiles(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "qualityProfiles"],
    queryFn: () => getQualityProfiles(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useSonarrRootFolders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "rootFolders"],
    queryFn: () => getRootFolders(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useSonarrTags(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "tags"],
    queryFn: () => getTags(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useSonarrReleasesForEpisode(
  episodeId: number,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "releases", "episode", episodeId],
    queryFn: ({ signal }) =>
      getReleasesForEpisode(episodeId, id ?? undefined, signal),
    enabled: enabled && episodeId > 0 && !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSonarrReleasesForSeason(
  seriesId: number,
  seasonNumber: number,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "releases", "season", seriesId, seasonNumber],
    queryFn: ({ signal }) =>
      getReleasesForSeason(seriesId, seasonNumber, id ?? undefined, signal),
    enabled: enabled && seriesId > 0 && seasonNumber >= 0 && !!id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useGrabSonarrRelease(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({ guid, indexerId }: { guid: string; indexerId: number }) =>
      grabSonarrRelease(guid, indexerId, id ?? undefined),
    onSuccess: () => {
      toast("Sent to download client");
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "queue"] });
    },
    onError: (err) => {
      toastError("Failed to grab release", err);
    },
  });
}
