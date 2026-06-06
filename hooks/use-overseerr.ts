import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  getRequests,
  getRequestCount,
  searchMedia,
  getTrending,
  getPopularMovies,
  getPopularTV,
  getUpcomingMovies,
  getNetworkContent,
  getStudioContent,
  getGenreContent,
  getGenreSlider,
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
import type { DiscoverCollectionKind } from "@/lib/overseerr-discover";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function useOverseerrRequests(
  page = 1,
  filter?: "all" | "approved" | "pending" | "processing" | "available",
  sort: "added" | "modified" = "added",
  instanceId?: string,
  active = true,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "requests", page, filter, sort],
    queryFn: () => getRequests(page, 20, filter, sort, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id && active,
  });
}

export function useOverseerrRequestCount(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "requestCount"],
    queryFn: () => getRequestCount(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useOverseerrSearch(query: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "search", query],
    queryFn: () => searchMedia(query, 1, id ?? undefined),
    enabled: query.length >= 2 && !!id,
  });
}

export function useOverseerrMediaDetails(
  tmdbId: number,
  mediaType: OverseerrMediaType,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery<OverseerrMovieDetails | OverseerrTVDetails>({
    queryKey: ["overseerr", id, "mediaDetails", mediaType, tmdbId],
    queryFn: () =>
      mediaType === "movie"
        ? getMovieDetails(tmdbId, id ?? undefined)
        : getTVDetails(tmdbId, id ?? undefined),
    staleTime: 600000, // 10 min — titles don't change
    enabled: enabled && !!id,
  });
}

export function useOverseerrTrending(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "trending"],
    queryFn: () => getTrending(1, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000, // 5 min
  });
}

export function useOverseerrPopularMovies(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "popularMovies"],
    queryFn: () => getPopularMovies(1, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

export function useOverseerrPopularTV(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "popularTV"],
    queryFn: () => getPopularTV(1, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

export function useOverseerrUpcomingMovies(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "upcomingMovies"],
    queryFn: () => getUpcomingMovies(1, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

// --- Browse by network / studio / genre ---

// Paginated discover list for a single network, studio, or genre. `kind`
// selects the endpoint; `genreMediaType` is only consulted when kind ===
// "genre" (network → tv, studio → movie are implied by the endpoint). The
// endpoints are 1-based and report totalPages, so we page until page ===
// totalPages.
export function useOverseerrDiscoverList(
  kind: DiscoverCollectionKind,
  id: number,
  genreMediaType: OverseerrMediaType = "movie",
  instanceId?: string,
) {
  const { instanceId: target, enabled } = useInstanceTarget("overseerr", instanceId);
  return useInfiniteQuery({
    queryKey: ["overseerr", target, "discoverList", kind, id, genreMediaType],
    queryFn: ({ pageParam }) => {
      if (kind === "network") return getNetworkContent(id, pageParam, target ?? undefined);
      if (kind === "studio") return getStudioContent(id, pageParam, target ?? undefined);
      return getGenreContent(genreMediaType, id, pageParam, target ?? undefined);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: enabled && !!target && id > 0,
    staleTime: 300000,
  });
}

export function useOverseerrGenreSlider(
  mediaType: OverseerrMediaType,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "genreSlider", mediaType],
    queryFn: () => getGenreSlider(mediaType, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 3600000, // 1 hour — genres rarely change
  });
}

export function useRequestMovie(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: ({
      tmdbId,
      options,
    }: {
      tmdbId: number;
      options?: OverseerrRequestOptions;
    }) => requestMovie(tmdbId, options, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

export function useRequestTV(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: ({
      tmdbId,
      seasons = "all",
      options,
    }: {
      tmdbId: number;
      seasons?: number[] | "all";
      options?: OverseerrRequestOptions;
    }) => requestTV(tmdbId, seasons, options, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

// --- Service discovery hooks ---

export function useOverseerrRadarrServers(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "service", "radarr"],
    queryFn: () => getOverseerrRadarrServers(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useOverseerrSonarrServers(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "service", "sonarr"],
    queryFn: () => getOverseerrSonarrServers(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useOverseerrRadarrServerDetails(
  serverId: number | undefined,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "service", "radarr", serverId],
    queryFn: () => getOverseerrRadarrServerDetails(serverId!, id ?? undefined),
    enabled: enabled && serverId !== undefined && serverId >= 0 && !!id,
    staleTime: Infinity,
  });
}

export function useOverseerrSonarrServerDetails(
  serverId: number | undefined,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "service", "sonarr", serverId],
    queryFn: () => getOverseerrSonarrServerDetails(serverId!, id ?? undefined),
    enabled: enabled && serverId !== undefined && serverId >= 0 && !!id,
    staleTime: Infinity,
  });
}

export function useApproveRequest(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (requestId: number) => approveRequest(requestId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requestCount"] });
    },
  });
}

export function useDeclineRequest(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (requestId: number) => declineRequest(requestId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requestCount"] });
    },
  });
}
