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
  getOverseerrUsers,
  getSeerrMe,
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
import { useInstanceTarget, useTargetInstance } from "@/hooks/use-instance-target";
import { resolveRequestUser } from "@/lib/overseerr-request-user";
import { getSeerrSessionMe } from "@/lib/seerr-session";
import { deriveSeerrCapabilities } from "@/lib/seerr-permissions";
import type { SeerrMe } from "@/lib/seerr-auth";

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

// `active` (#332): GET /request/count has no permission check and is not
// scoped to the caller, so for an account that only sees its own requests the
// number is server-wide and misleading. Callers pass `canViewAllRequests`.
export function useOverseerrRequestCount(instanceId?: string, active = true) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "requestCount"],
    queryFn: () => getRequestCount(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id && active,
  });
}

/**
 * The account this instance acts as (#332): the signed-in user in a sign-in
 * mode, the admin in API-key mode. Its `permissions` bitfield is what every
 * Seerr surface gates on, through hooks/use-seerr-capabilities.ts.
 *
 * Slot 1 of the key is the instance id, so updateInstanceSecrets's predicate
 * invalidation refetches identity on every credential save. `initialData`
 * reads the session cache the probe and the login already filled, so a screen
 * mounted after either renders with its controls in place, no spinner.
 */
export function useSeerrMe(instanceId?: string, active = true) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery<SeerrMe>({
    queryKey: ["overseerr", id, "me"],
    queryFn: () => getSeerrMe(id ?? undefined),
    enabled: enabled && !!id && active,
    staleTime: 5 * 60_000,
    // Focus/reconnect refetches are off app-wide, so a failed identity read
    // (host down at launch, LAN guard, wrong password) would otherwise stay
    // failed until something else re-keys it. Poll only while errored: a
    // refused credential is answered from lib/seerr-session's cooldown
    // without touching the network, so this costs nothing in the bad case.
    refetchInterval: (query) =>
      query.state.status === "error" ? POLLING_INTERVALS.queue : false,
    initialData: () => (id ? (getSeerrSessionMe(id) ?? undefined) : undefined),
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
    // Short: the payload carries live mediaInfo.status, which flips when a
    // Seerr availability scan runs — a long staleTime kept showing
    // "Requested" for titles already available (#266).
    staleTime: 30000,
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

/**
 * The Seerr accounts on this instance, for the "Request As" pickers (#332).
 *
 * Long staleTime: a household's user list changes about never, and this is
 * queried from both the settings card and the request sheet.
 */
export function useOverseerrUsers(instanceId?: string, active = true) {
  const { instanceId: id, enabled } = useInstanceTarget("overseerr", instanceId);
  return useQuery({
    queryKey: ["overseerr", id, "users"],
    queryFn: () => getOverseerrUsers(100, id ?? undefined),
    // Only worth fetching for an account that may file requests on behalf of
    // another (MANAGE_USERS or MANAGE_REQUESTS); callers pass `canRequestAs`.
    enabled: enabled && !!id && active,
    staleTime: 3600000, // 1 hour
  });
}

/**
 * The instance's stored "Request As" default, or undefined to let Seerr
 * attribute requests to the API key's own identity.
 *
 * Read here rather than at each call site so every request surface picks the
 * preference up — including the one-tap request in the media detail modal,
 * which has no picker of its own. `resolveRequestUser` decides how it combines
 * with a per-request choice.
 */
function useRequestAsUserId(instanceId?: string): number | undefined {
  const stored = useTargetInstance("overseerr", instanceId)?.requestAsUserId;
  // A stored default only applies to an account that may request on behalf
  // of another (#332). The editor clears it when leaving API-key mode, but an
  // export from before the switch can bring it back, and sending it from a
  // plain user account makes Seerr reject the whole request.
  const { data: me } = useSeerrMe(instanceId);
  return deriveSeerrCapabilities(me).canRequestAs ? stored : undefined;
}

export function useRequestMovie(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  const defaultUserId = useRequestAsUserId(instanceId);
  return useMutation({
    mutationFn: ({
      tmdbId,
      options,
    }: {
      tmdbId: number;
      options?: OverseerrRequestOptions;
    }) => requestMovie(tmdbId, resolveRequestUser(options, defaultUserId), id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overseerr"] });
    },
  });
}

export function useRequestTV(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("overseerr", instanceId);
  const defaultUserId = useRequestAsUserId(instanceId);
  return useMutation({
    mutationFn: ({
      tmdbId,
      seasons = "all",
      options,
    }: {
      tmdbId: number;
      seasons?: number[] | "all";
      options?: OverseerrRequestOptions;
    }) =>
      requestTV(
        tmdbId,
        seasons,
        resolveRequestUser(options, defaultUserId),
        id ?? undefined,
      ),
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
    // Reading the slider config is plain isAuthenticated upstream, so any
    // signed-in account gets the real layout (#332); only WRITING needs ADMIN.
    // Older servers still 403 non-admin reads, so fail fast and let the
    // Discover tab fall back to its built-in layout rather than retrying.
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
