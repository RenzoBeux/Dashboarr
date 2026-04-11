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
  getQualityProfiles,
  getRootFolders,
} from "@/services/sonarr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";

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
