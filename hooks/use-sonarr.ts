import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSeries,
  getSeriesById,
  getEpisodes,
  getEpisodeFiles,
  getCalendar,
  getQueue,
  searchSeries,
  addSeries,
  deleteSeries,
  toggleEpisodeMonitored,
  toggleSeriesMonitored,
  searchForSeries,
  searchForEpisodes,
  getQualityProfiles,
  getRootFolders,
  getTags,
  getReleasesForEpisode,
  getReleasesForSeason,
  grabSonarrRelease,
} from "@/services/sonarr-api";
import { toast } from "@/components/ui/toast";
import type { SonarrSeries } from "@/lib/types";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";
import { getHttpErrorMessage } from "@/lib/http-client";

function useSonarrEnabled() {
  return useConfigStore((s) => s.services.sonarr.enabled);
}

export function useSonarrSeries() {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "series"],
    queryFn: getSeries,
    enabled,
  });
}

export function useSonarrSeriesById(id: number) {
  return useQuery({
    queryKey: ["sonarr", "series", id],
    queryFn: () => getSeriesById(id),
    enabled: id > 0,
  });
}

export function useSonarrEpisodes(seriesId: number) {
  return useQuery({
    queryKey: ["sonarr", "episodes", seriesId],
    queryFn: () => getEpisodes(seriesId),
    enabled: seriesId > 0,
  });
}

export function useSonarrEpisodeFiles(seriesId: number) {
  return useQuery({
    queryKey: ["sonarr", "episodeFiles", seriesId],
    queryFn: () => getEpisodeFiles(seriesId),
    enabled: seriesId > 0,
  });
}

export function useSonarrCalendar(days = 7) {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "calendar", days],
    queryFn: () => getCalendar(getDateOffset(0), getDateOffset(days)),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled,
  });
}

export function useSonarrQueue() {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "queue"],
    queryFn: () => getQueue(1, 20, true, true),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useSonarrSearch(term: string) {
  return useQuery({
    queryKey: ["sonarr", "search", term],
    queryFn: () => searchSeries(term),
    enabled: term.length >= 2,
  });
}

export function useAddSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addSeries,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", "series"] });
    },
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteFiles = false,
    }: {
      id: number;
      deleteFiles?: boolean;
    }) => deleteSeries(id, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", "series"] });
    },
  });
}

export function useToggleEpisodeMonitored() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      episodeId,
      monitored,
    }: {
      episodeId: number;
      monitored: boolean;
    }) => toggleEpisodeMonitored(episodeId, monitored),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", "episodes"] });
    },
  });
}

export function useSearchForSeries() {
  return useMutation({
    mutationFn: (seriesId: number) => searchForSeries(seriesId),
    onSuccess: () => toast("Search started"),
    onError: () => toast("Search failed", "error"),
  });
}

export function useSearchForEpisodes() {
  return useMutation({
    mutationFn: (episodeIds: number[]) => searchForEpisodes(episodeIds),
    onSuccess: () => toast("Search started"),
    onError: () => toast("Search failed", "error"),
  });
}

export function useToggleSeriesMonitored() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      seriesId,
      monitored,
    }: {
      seriesId: number;
      monitored: boolean;
    }) => toggleSeriesMonitored(seriesId, monitored),
    onMutate: async ({ seriesId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["sonarr", "series"] });
      await queryClient.cancelQueries({ queryKey: ["sonarr", "series", seriesId] });

      const prevList = queryClient.getQueryData<SonarrSeries[]>(["sonarr", "series"]);
      const prevDetail = queryClient.getQueryData<SonarrSeries>(["sonarr", "series", seriesId]);

      if (prevList) {
        queryClient.setQueryData<SonarrSeries[]>(
          ["sonarr", "series"],
          prevList.map((s) => (s.id === seriesId ? { ...s, monitored } : s)),
        );
      }
      if (prevDetail) {
        queryClient.setQueryData<SonarrSeries>(
          ["sonarr", "series", seriesId],
          { ...prevDetail, monitored },
        );
      }

      return { prevList, prevDetail };
    },
    onError: (_err, { seriesId }, context) => {
      if (context?.prevList) {
        queryClient.setQueryData(["sonarr", "series"], context.prevList);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(["sonarr", "series", seriesId], context.prevDetail);
      }
      toast("Failed to update monitoring", "error");
    },
    onSettled: (_data, _err, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["sonarr", "series"] });
      queryClient.invalidateQueries({ queryKey: ["sonarr", "series", seriesId] });
    },
  });
}

export function useSonarrQualityProfiles() {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "qualityProfiles"],
    queryFn: getQualityProfiles,
    enabled,
    staleTime: Infinity,
  });
}

export function useSonarrRootFolders() {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "rootFolders"],
    queryFn: getRootFolders,
    enabled,
    staleTime: Infinity,
  });
}

export function useSonarrTags() {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "tags"],
    queryFn: getTags,
    enabled,
    staleTime: Infinity,
  });
}

export function useSonarrReleasesForEpisode(episodeId: number) {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "releases", "episode", episodeId],
    queryFn: () => getReleasesForEpisode(episodeId),
    enabled: enabled && episodeId > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSonarrReleasesForSeason(
  seriesId: number,
  seasonNumber: number,
) {
  const enabled = useSonarrEnabled();
  return useQuery({
    queryKey: ["sonarr", "releases", "season", seriesId, seasonNumber],
    queryFn: () => getReleasesForSeason(seriesId, seasonNumber),
    enabled: enabled && seriesId > 0 && seasonNumber >= 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useGrabSonarrRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guid, indexerId }: { guid: string; indexerId: number }) =>
      grabSonarrRelease(guid, indexerId),
    onSuccess: () => {
      toast("Sent to download client");
      queryClient.invalidateQueries({ queryKey: ["sonarr", "queue"] });
    },
    onError: (err) => {
      toast(getHttpErrorMessage(err) ?? "Failed to grab release", "error");
    },
  });
}
