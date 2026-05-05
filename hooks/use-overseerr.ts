import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRequests,
  getRequestCount,
  searchMedia,
  getTrending,
  getPopularMovies,
  getPopularTV,
  getUpcomingMovies,
  requestMovie,
  requestTV,
  approveRequest,
  declineRequest,
  getMovieDetails,
  getTVDetails,
  getOverseerrRadarrServers,
  getOverseerrSonarrServers,
  getOverseerrRadarrServerDetails,
  getOverseerrSonarrServerDetails,
  type OverseerrRequestOptions,
} from "@/services/overseerr-api";
import type {
  OverseerrMediaType,
  OverseerrMovieDetails,
  OverseerrTVDetails,
} from "@/lib/types";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useOverseerrEnabled() {
  return useConfigStore((s) => s.services.overseerr.enabled);
}

export function useOverseerrRequests(
  page = 1,
  filter?: "all" | "approved" | "pending" | "processing" | "available",
  sort: "added" | "modified" = "added",
) {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "requests", page, filter, sort],
    queryFn: () => getRequests(page, 20, filter, sort),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useOverseerrRequestCount() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "requestCount"],
    queryFn: getRequestCount,
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function useOverseerrSearch(query: string) {
  return useQuery({
    queryKey: ["overseerr", "search", query],
    queryFn: () => searchMedia(query),
    enabled: query.length >= 2,
  });
}

export function useOverseerrMediaDetails(tmdbId: number, mediaType: OverseerrMediaType) {
  const enabled = useOverseerrEnabled();
  return useQuery<OverseerrMovieDetails | OverseerrTVDetails>({
    queryKey: ["overseerr", "mediaDetails", mediaType, tmdbId],
    queryFn: () =>
      mediaType === "movie" ? getMovieDetails(tmdbId) : getTVDetails(tmdbId),
    staleTime: 600000, // 10 min — titles don't change
    enabled,
  });
}

export function useOverseerrTrending() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "trending"],
    queryFn: () => getTrending(),
    enabled,
    staleTime: 300000, // 5 min
  });
}

export function useOverseerrPopularMovies() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "popularMovies"],
    queryFn: () => getPopularMovies(),
    enabled,
    staleTime: 300000,
  });
}

export function useOverseerrPopularTV() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "popularTV"],
    queryFn: () => getPopularTV(),
    enabled,
    staleTime: 300000,
  });
}

export function useOverseerrUpcomingMovies() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "upcomingMovies"],
    queryFn: () => getUpcomingMovies(),
    enabled,
    staleTime: 300000,
  });
}

export function useRequestMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tmdbId,
      options,
    }: {
      tmdbId: number;
      options?: OverseerrRequestOptions;
    }) => requestMovie(tmdbId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

export function useRequestTV() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tmdbId,
      seasons = "all",
      options,
    }: {
      tmdbId: number;
      seasons?: number[] | "all";
      options?: OverseerrRequestOptions;
    }) => requestTV(tmdbId, seasons, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

// --- Service discovery hooks ---

export function useOverseerrRadarrServers() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "service", "radarr"],
    queryFn: getOverseerrRadarrServers,
    enabled,
    staleTime: Infinity,
  });
}

export function useOverseerrSonarrServers() {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "service", "sonarr"],
    queryFn: getOverseerrSonarrServers,
    enabled,
    staleTime: Infinity,
  });
}

export function useOverseerrRadarrServerDetails(id: number | undefined) {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "service", "radarr", id],
    queryFn: () => getOverseerrRadarrServerDetails(id!),
    enabled: enabled && id !== undefined && id >= 0,
    staleTime: Infinity,
  });
}

export function useOverseerrSonarrServerDetails(id: number | undefined) {
  const enabled = useOverseerrEnabled();
  return useQuery({
    queryKey: ["overseerr", "service", "sonarr", id],
    queryFn: () => getOverseerrSonarrServerDetails(id!),
    enabled: enabled && id !== undefined && id >= 0,
    staleTime: Infinity,
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: number) => approveRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", "requests"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", "requestCount"] });
    },
  });
}

export function useDeclineRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: number) => declineRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", "requests"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", "requestCount"] });
    },
  });
}
