import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSeries,
  getSeriesById,
  getEpisodes,
  getEpisodeFiles,
  deleteEpisodeFile,
  getCalendar,
  getQueue,
  getHistory,
  searchSeries,
  addSeries,
  deleteSeries,
  toggleEpisodeMonitored,
  toggleSeriesMonitored,
  updateSeries,
  searchForSeries,
  searchForEpisodes,
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
    queryFn: () =>
      getCalendar(getDateOffset(0), getDateOffset(days), {}, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!id,
  });
}

export function useSonarrQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "queue"],
    queryFn: () => getQueue(1, 20, true, true, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useSonarrHistory(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "history"],
    queryFn: () => getHistory(1, 50, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useSonarrSearch(term: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useQuery({
    queryKey: ["sonarr", id, "search", term],
    queryFn: () => searchSeries(term, id ?? undefined),
    enabled: term.length >= 2 && !!id,
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
      // Refresh the episode list, file map, and series stats (file counts).
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "episodes"] });
      queryClient.invalidateQueries({
        queryKey: ["sonarr", id, "episodeFiles"],
      });
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
      toast("Episode file deleted");
    },
    onError: (err) => toastError("Delete failed", err),
  });
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

export function useUpdateSeriesQualityProfile(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sonarr", instanceId);
  return useMutation({
    mutationFn: ({
      seriesId,
      qualityProfileId,
    }: {
      seriesId: number;
      qualityProfileId: number;
    }) => {
      const cached = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      if (!cached) throw new Error("Series not loaded");
      return updateSeries({ ...cached, qualityProfileId }, id ?? undefined);
    },
    onMutate: async ({ seriesId, qualityProfileId }) => {
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
          { ...prevDetail, qualityProfileId },
        );
      }
      if (prevList) {
        queryClient.setQueryData<SonarrSeries[]>(
          ["sonarr", id, "series"],
          prevList.map((s) =>
            s.id === seriesId ? { ...s, qualityProfileId } : s,
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
      toastError("Failed to update quality profile", err);
    },
    onSettled: (_data, _err, { seriesId }) => {
      queryClient.invalidateQueries({
        queryKey: ["sonarr", id, "series", seriesId],
      });
      queryClient.invalidateQueries({ queryKey: ["sonarr", id, "series"] });
    },
  });
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
    }) => {
      const cached = queryClient.getQueryData<SonarrSeries>([
        "sonarr",
        id,
        "series",
        seriesId,
      ]);
      if (!cached) throw new Error("Series not loaded");
      return updateSeries({ ...cached, rootFolderPath }, id ?? undefined, {
        moveFiles,
      });
    },
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
    queryFn: () => getReleasesForEpisode(episodeId, id ?? undefined),
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
    queryFn: () =>
      getReleasesForSeason(seriesId, seasonNumber, id ?? undefined),
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
