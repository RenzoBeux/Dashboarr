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
  getUpcomingTv,
  getRecentlyAdded,
  getNetworkContent,
  getStudioContent,
  getGenreContent,
  getGenreSlider,
  getDiscover,
  getDiscoverSliders,
  saveDiscoverSliders,
  addDiscoverSlider,
  updateDiscoverSlider,
  deleteDiscoverSlider,
  resetDiscoverSliders,
  requestMovie,
  requestTV,
  approveRequest,
  declineRequest,
  deleteRequest,
  deleteMedia,
  getMovieDetails,
  getTVDetails,
  getOverseerrRadarrServers,
  getOverseerrSonarrServers,
  getOverseerrRadarrServerDetails,
  getOverseerrSonarrServerDetails,
  type OverseerrRequestOptions,
} from "@/services/overseerr-api";
import {
  DiscoverSliderType,
  type OverseerrMediaType,
  type OverseerrMovieDetails,
  type OverseerrTVDetails,
  type OverseerrSearchResponse,
  type DiscoverSlider,
  type DiscoverSliderInput,
  type DiscoverSliderCreate,
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
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "search", query],
    queryFn: () => searchMedia(query, 1, id ?? undefined),
    enabled: enabled && query.length >= 2 && !!id,
  });
}

export function useOverseerrMediaDetails(
  tmdbId: number,
  mediaType: OverseerrMediaType,
  instanceId?: string,
  active = true,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery<OverseerrMovieDetails | OverseerrTVDetails>({
    queryKey: ["overseerr", id, "mediaDetails", mediaType, tmdbId],
    queryFn: () =>
      mediaType === "movie"
        ? getMovieDetails(tmdbId, id ?? undefined)
        : getTVDetails(tmdbId, id ?? undefined),
    staleTime: 600000, // 10 min — titles don't change
    enabled: enabled && !!id && tmdbId > 0 && active,
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

// Deletes the request record only. Mirrors approve/decline invalidation since
// the underlying media availability is unaffected.
export function useDeleteRequest(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (requestId: number) => deleteRequest(requestId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "requestCount"] });
    },
  });
}

// Untracks the media in Seerr (resets status so it can be re-requested; does not
// touch files). Invalidates the whole "overseerr" subtree because this also
// changes media-detail availability, not just the requests list.
export function useDeleteMedia(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (mediaId: number) => deleteMedia(mediaId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

// --- Discover customization (settings/discover sliders) ---

export function useOverseerrDiscoverSliders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "discoverSliders"],
    queryFn: () => getDiscoverSliders(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000, // 5 min — config rarely changes
    // A non-admin key 403s here; fail fast so the Discover tab falls back to its
    // built-in layout instead of retrying a request that can't succeed.
    retry: 1,
  });
}

export function useSaveDiscoverSliders(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (sliders: DiscoverSliderInput[]) =>
      saveDiscoverSliders(sliders, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "discoverSliders"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "customSlider"] });
    },
  });
}

export function useAddDiscoverSlider(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (body: DiscoverSliderCreate) => addDiscoverSlider(body, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "discoverSliders"] });
    },
  });
}

export function useUpdateDiscoverSlider(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: ({ sliderId, body }: { sliderId: number; body: DiscoverSliderCreate }) =>
      updateDiscoverSlider(sliderId, body, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "discoverSliders"] });
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "customSlider"] });
    },
  });
}

export function useDeleteDiscoverSlider(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: (sliderId: number) => deleteDiscoverSlider(sliderId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr", id, "discoverSliders"] });
    },
  });
}

export function useResetDiscoverSliders(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  return useMutation({
    mutationFn: () => resetDiscoverSliders(id ?? undefined),
    onSuccess: () => {
      // Reset re-adds the built-ins, so invalidate the whole instance subtree.
      queryClient.invalidateQueries({ queryKey: ["overseerr", id] });
    },
  });
}

// --- Built-in slider renderers the legacy layout didn't expose ---

export function useOverseerrRecentlyAdded(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "recentlyAdded"],
    queryFn: () => getRecentlyAdded(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

export function useOverseerrUpcomingTV(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "upcomingTv"],
    queryFn: () => getUpcomingTv(1, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

// --- Custom slider media ---

// watchProviders results are region-scoped; we default to US. (A proper region
// picker is a follow-up — see customize-discover.tsx.)
const STREAMING_WATCH_REGION = "US";

// Maps a custom slider (type + data payload) to the right discover fetch.
// Genre/studio/network reuse the proven path-param endpoints; keyword and
// streaming-services use the generic /discover query; search reuses /search.
function fetchCustomSlider(
  type: DiscoverSlider["type"],
  data: string,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  switch (type) {
    case DiscoverSliderType.TMDB_MOVIE_GENRE:
      return getGenreContent("movie", Number(data), 1, instanceId);
    case DiscoverSliderType.TMDB_TV_GENRE:
      return getGenreContent("tv", Number(data), 1, instanceId);
    case DiscoverSliderType.TMDB_STUDIO:
      return getStudioContent(Number(data), 1, instanceId);
    case DiscoverSliderType.TMDB_NETWORK:
      return getNetworkContent(Number(data), 1, instanceId);
    case DiscoverSliderType.TMDB_MOVIE_KEYWORD:
      return getDiscover("movie", { keywords: data }, instanceId);
    case DiscoverSliderType.TMDB_TV_KEYWORD:
      return getDiscover("tv", { keywords: data }, instanceId);
    case DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES:
      return getDiscover(
        "movie",
        { watchProviders: data, watchRegion: STREAMING_WATCH_REGION },
        instanceId,
      );
    case DiscoverSliderType.TMDB_TV_STREAMING_SERVICES:
      return getDiscover(
        "tv",
        { watchProviders: data, watchRegion: STREAMING_WATCH_REGION },
        instanceId,
      );
    case DiscoverSliderType.TMDB_SEARCH:
      return searchMedia(data, 1, instanceId);
    default:
      return Promise.resolve({ page: 1, totalPages: 0, totalResults: 0, results: [] });
  }
}

// Fetches the media for a single custom slider. Keyed by the slider id + type +
// data so two custom rows never collide in the query cache.
export function useOverseerrCustomSlider(
  slider: Pick<DiscoverSlider, "id" | "type" | "data">,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  const data = slider.data ?? "";
  return useQuery({
    queryKey: ["overseerr", id, "customSlider", slider.id, slider.type, data],
    queryFn: () => fetchCustomSlider(slider.type, data, id ?? undefined),
    enabled: enabled && !!id && data.length > 0,
    staleTime: 300000,
  });
}
