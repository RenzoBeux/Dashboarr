import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Search,
  Check,
  X,
  Film,
  Tv,
  Compass,
  ListFilter,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import {
  useSortStore,
  SORT_DEFAULTS,
  type RequestsSortKey,
} from "@/store/sort-store";
import { ICON } from "@/lib/constants";
import { successHaptic, errorHaptic } from "@/lib/haptics";
import { MediaRow } from "@/components/overseerr/media-row";
import { PosterCard } from "@/components/overseerr/poster-card";
import {
  DiscoverCollectionSlider,
  type DiscoverSliderItem,
} from "@/components/overseerr/discover-collection-slider";
import { usePosterCellWidth } from "@/hooks/use-poster-cell";
import { MediaDetailModal } from "@/components/overseerr/media-detail-modal";
import {
  useOverseerrRequests,
  useOverseerrRequestCount,
  useOverseerrSearch,
  useOverseerrMediaDetails,
  useOverseerrTrending,
  useOverseerrPopularMovies,
  useOverseerrPopularTV,
  useOverseerrUpcomingMovies,
  useOverseerrGenreSlider,
  useApproveRequest,
  useDeclineRequest,
} from "@/hooks/use-overseerr";
import { getPosterUrl, getBackdropUrl } from "@/services/overseerr-api";
import {
  NETWORKS,
  STUDIOS,
  getDiscoverLogoUrl,
  type DiscoverCollectionKind,
} from "@/lib/overseerr-discover";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import type {
  OverseerrRequest,
  OverseerrMediaResult,
  OverseerrMediaType,
} from "@/lib/types";

type Tab = "discover" | "search" | "requests";
type RequestFilter =
  | "all"
  | "pending"
  | "approved"
  | "processing"
  | "available";
type MediaTypeFilter = "all" | "movie" | "tv";

const REQUEST_SORT_OPTIONS: { key: RequestsSortKey; label: string }[] = [
  { key: "created-desc", label: "Newest First" },
  { key: "updated-desc", label: "Recently Updated" },
];

// Default branch covers legacy values ("created-asc"/"updated-asc") that may
// still be persisted from before the asc options were removed.
function sortToParams(sort: RequestsSortKey): { sort: "added" | "modified" } {
  switch (sort) {
    case "updated-desc":
      return { sort: "modified" };
    case "created-desc":
    default:
      return { sort: "added" };
  }
}

const GRID_GAP = 12;

// Static logo tiles for the network/studio sliders (computed once).
const NETWORK_ITEMS: DiscoverSliderItem[] = NETWORKS.map((c) => ({
  id: c.id,
  name: c.name,
  imageUrl: getDiscoverLogoUrl(c.logoPath),
}));
const STUDIO_ITEMS: DiscoverSliderItem[] = STUDIOS.map((c) => ({
  id: c.id,
  name: c.name,
  imageUrl: getDiscoverLogoUrl(c.logoPath),
}));

function toGenreItems(
  genres: { id: number; name: string; backdrops: string[] }[] | undefined,
): DiscoverSliderItem[] {
  return (genres ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    imageUrl: getBackdropUrl(g.backdrops?.[0]),
  }));
}

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Compass }[] = [
  { key: "discover", label: "Discover", icon: Compass },
  { key: "search", label: "Search", icon: Search },
  { key: "requests", label: "Requests", icon: ListFilter },
];

const REQUEST_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Approved",
  3: "Declined",
};

const MEDIA_STATUS_LABEL_OVERRIDE: Record<number, string | undefined> = {
  3: "Processing",
  4: "Partial",
  5: "Available",
};

const MEDIA_STATUS_VARIANT_OVERRIDE: Record<
  number,
  "info" | "success" | "warning" | undefined
> = {
  3: "info",
  4: "warning",
  5: "success",
};

const REQUEST_STATUS_VARIANTS: Record<
  number,
  "warning" | "success" | "error"
> = {
  1: "warning",
  2: "success",
  3: "error",
};

export default function RequestsScreen() {
  const { tab: initialTabParam } = useLocalSearchParams<{ tab?: string }>();
  const initialTab: Tab =
    initialTabParam === "requests" ||
    initialTabParam === "search" ||
    initialTabParam === "discover"
      ? initialTabParam
      : "discover";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedMedia, setSelectedMedia] =
    useState<OverseerrMediaResult | null>(null);
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["overseerr"]]);

  const overseerrHealth = healthData?.find((s) => s.id === "overseerr");

  const handleMediaPress = useCallback((item: OverseerrMediaResult) => {
    setSelectedMedia(item);
  }, []);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Seerr" online={overseerrHealth?.online} serviceId="overseerr" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {TAB_CONFIG.map(({ key, label, icon: TabIcon }) => (
          <FilterChip
            key={key}
            label={label}
            selected={tab === key}
            onPress={() => setTab(key)}
            icon={<Icon icon={TabIcon} size={14} color={tab === key ? "#fff" : "#a1a1aa"} />}
          />
        ))}
      </ScrollView>

      {tab === "discover" && <DiscoverTab onItemPress={handleMediaPress} />}
      {tab === "search" && <SearchTab onItemPress={handleMediaPress} />}
      {tab === "requests" && <RequestsList />}

      <MediaDetailModal
        item={selectedMedia}
        visible={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </ScreenWrapper>
  );
}

// ─── Discover Tab ──────────────────────────────────────────────

function DiscoverTab({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const router = useRouter();
  const trending = useOverseerrTrending();
  const popularMovies = useOverseerrPopularMovies();
  const popularTV = useOverseerrPopularTV();
  const upcoming = useOverseerrUpcomingMovies();
  const movieGenres = useOverseerrGenreSlider("movie");
  const tvGenres = useOverseerrGenreSlider("tv");

  const movieGenreItems = useMemo(
    () => toGenreItems(movieGenres.data),
    [movieGenres.data],
  );
  const tvGenreItems = useMemo(() => toGenreItems(tvGenres.data), [tvGenres.data]);

  const openCollection = useCallback(
    (
      kind: DiscoverCollectionKind,
      item: DiscoverSliderItem,
      mediaType?: OverseerrMediaType,
    ) => {
      const params = new URLSearchParams({
        kind,
        id: String(item.id),
        title: item.name,
      });
      if (kind === "genre" && mediaType) params.set("mediaType", mediaType);
      router.push(`/overseerr/discover-list?${params.toString()}`);
    },
    [router],
  );

  return (
    <View>
      <MediaRow
        title="Trending"
        items={trending.data?.results}
        isLoading={trending.isLoading}
        onItemPress={onItemPress}
      />
      <MediaRow
        title="Popular Movies"
        items={popularMovies.data?.results}
        isLoading={popularMovies.isLoading}
        onItemPress={onItemPress}
      />
      <MediaRow
        title="Popular TV Shows"
        items={popularTV.data?.results}
        isLoading={popularTV.isLoading}
        onItemPress={onItemPress}
      />
      <DiscoverCollectionSlider
        title="Networks"
        variant="logo"
        items={NETWORK_ITEMS}
        onItemPress={(item) => openCollection("network", item)}
      />
      <DiscoverCollectionSlider
        title="Studios"
        variant="logo"
        items={STUDIO_ITEMS}
        onItemPress={(item) => openCollection("studio", item)}
      />
      <DiscoverCollectionSlider
        title="Movie Genres"
        variant="genre"
        items={movieGenreItems}
        isLoading={movieGenres.isLoading}
        onItemPress={(item) => openCollection("genre", item, "movie")}
      />
      <DiscoverCollectionSlider
        title="TV Genres"
        variant="genre"
        items={tvGenreItems}
        isLoading={tvGenres.isLoading}
        onItemPress={(item) => openCollection("genre", item, "tv")}
      />
      <MediaRow
        title="Upcoming Movies"
        items={upcoming.data?.results}
        isLoading={upcoming.isLoading}
        onItemPress={onItemPress}
      />
    </View>
  );
}

// ─── Search Tab ────────────────────────────────────────────────

function SearchTab({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaTypeFilter>("all");
  const { data, isLoading } = useOverseerrSearch(query);

  const results = (data?.results ?? []).filter(
    (item) => mediaFilter === "all" || item.mediaType === mediaFilter,
  );

  return (
    <View>
      {/* Search input */}
      <View className="flex-row items-center gap-2 mb-3">
        <View className="flex-1">
          <TextInput
            placeholder="Search movies & shows..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            className="bg-surface-light rounded-xl p-3 active:opacity-70"
          >
            <Icon icon={X} size={20} color="#a1a1aa" />
          </Pressable>
        )}
      </View>

      {query.length >= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="mb-4"
        >
          {(["all", "movie", "tv"] as MediaTypeFilter[]).map((f) => (
            <FilterChip
              key={f}
              label={f === "all" ? "All" : f === "movie" ? "Movies" : "TV Shows"}
              selected={mediaFilter === f}
              onPress={() => setMediaFilter(f)}
            />
          ))}
        </ScrollView>
      )}

      {/* Loading */}
      {isLoading && query.length >= 2 && (
        <Text className="text-zinc-500 text-center py-4">Searching...</Text>
      )}

      {/* Empty */}
      {results.length === 0 && query.length >= 2 && !isLoading && (
        <EmptyState title="No results" message={`Nothing found for "${query}"`} />
      )}

      {/* Prompt */}
      {query.length < 2 && !isLoading && (
        <EmptyState
          icon={<Icon icon={Search} size={32} color="#71717a" />}
          title="Search for media"
          message="Type at least 2 characters to search"
        />
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <View
          className="flex-row flex-wrap"
          style={{ gap: GRID_GAP }}
        >
          {results.map((item) => (
            <PosterGridItem
              key={`${item.mediaType}-${item.id}`}
              item={item}
              onPress={onItemPress}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function PosterGridItem({
  item,
  onPress,
}: {
  item: OverseerrMediaResult;
  onPress: (item: OverseerrMediaResult) => void;
}) {
  const cellWidth = usePosterCellWidth();
  return (
    <PosterCard
      item={item}
      onPress={onPress}
      size="sm"
      widthOverride={cellWidth}
    />
  );
}

// ─── Requests Tab ──────────────────────────────────────────────

function RequestsList() {
  const [filter, setFilter] = useState<RequestFilter>("all");
  const sort = useSortStore((s) => s.requests);
  const setSort = useSortStore((s) => s.setRequests);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const { sort: apiSort } = sortToParams(sort);
  const { data, isLoading, error } = useOverseerrRequests(1, filter, apiSort);
  const { data: counts } = useOverseerrRequestCount();
  const approve = useApproveRequest();
  const decline = useDeclineRequest();

  const requests = data?.results ?? [];

  const filterOptions: { key: RequestFilter; label: string }[] = (
    ["all", "pending", "approved", "processing"] as RequestFilter[]
  ).map((f) => ({
    key: f,
    label: `${f.charAt(0).toUpperCase() + f.slice(1)}${f === "pending" && counts?.pending ? ` (${counts.pending})` : ""}`,
  }));

  return (
    <View>
      <View className="mb-4">
        <FilterSortButton
          summary={`${filterOptions.find((f) => f.key === filter)?.label ?? ""} · ${REQUEST_SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ""}`}
          onPress={() => setFilterSortOpen(true)}
          active={filter !== "all" || sort !== SORT_DEFAULTS.requests}
        />
      </View>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : error ? (
        <ErrorBanner error={error} title="Failed to load requests" />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No requests"
          message={`No ${filter} requests found`}
        />
      ) : (
        <View className="gap-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onApprove={() => approve.mutate(req.id)}
              onDecline={() => decline.mutate(req.id)}
              busy={approve.isPending || decline.isPending}
            />
          ))}
        </View>
      )}

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort requests"
        filterOptions={filterOptions}
        filterValue={filter}
        onFilterChange={setFilter}
        sortOptions={REQUEST_SORT_OPTIONS}
        sortValue={sort}
        onSortChange={setSort}
      />
    </View>
  );
}

function RequestCard({
  request,
  onApprove,
  onDecline,
  busy,
}: {
  request: OverseerrRequest;
  onApprove: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  const isPending = request.status === 1;
  const { data: mediaDetails } = useOverseerrMediaDetails(
    request.media.tmdbId,
    request.media.mediaType,
  );

  const title =
    (mediaDetails as { title?: string; name?: string } | undefined)?.title ||
    (mediaDetails as { title?: string; name?: string } | undefined)?.name ||
    (request.media.mediaType === "movie" ? "Movie" : "TV") +
      ` #${request.media.tmdbId}`;

  const posterPath = (mediaDetails as { posterPath?: string } | undefined)
    ?.posterPath;
  const posterUrl = getPosterUrl(posterPath, "w185");

  const mediaStatusOverride =
    request.status === 2
      ? MEDIA_STATUS_LABEL_OVERRIDE[request.media.status]
      : undefined;
  const statusLabel =
    mediaStatusOverride ?? REQUEST_STATUS_LABELS[request.status] ?? "Unknown";
  const statusVariant: "warning" | "success" | "error" | "info" | "default" =
    (request.status === 2 &&
      MEDIA_STATUS_VARIANT_OVERRIDE[request.media.status]) ||
    REQUEST_STATUS_VARIANTS[request.status] ||
    "default";

  const MediaIcon = request.media.mediaType === "movie" ? Film : Tv;

  return (
    <Card>
      <View className="flex-row gap-3">
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            className="w-14 h-20 rounded-lg bg-surface-light"
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={posterUrl}
          />
        ) : (
          <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
            <Icon icon={MediaIcon} size={20} color="#71717a" />
          </View>
        )}

        <View className="flex-1 justify-center gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              className="text-zinc-200 text-base font-medium flex-1"
              numberOfLines={2}
            >
              {title}
            </Text>
            <Badge label={statusLabel} variant={statusVariant} />
          </View>

          <Text className="text-zinc-500 text-xs">
            {request.media.mediaType === "movie" ? "Movie" : "TV"} ·{" "}
            {request.requestedBy.displayName} ·{" "}
            {new Date(request.createdAt).toLocaleDateString()}
          </Text>

          {isPending && (
            <View className="flex-row gap-2 mt-1">
              <Pressable
                onPress={() => {
                  successHaptic();
                  onApprove();
                }}
                disabled={busy}
                hitSlop={8}
                className={`flex-row items-center gap-1 bg-green-600/20 px-3.5 py-2 rounded-lg active:opacity-70 ${busy ? "opacity-50" : ""}`}
              >
                <Icon icon={Check} size={ICON.SM} color="#22c55e" />
                <Text className="text-success text-sm font-medium">
                  Approve
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  errorHaptic();
                  onDecline();
                }}
                disabled={busy}
                hitSlop={8}
                className={`flex-row items-center gap-1 bg-red-600/20 px-3.5 py-2 rounded-lg active:opacity-70 ${busy ? "opacity-50" : ""}`}
              >
                <Icon icon={X} size={ICON.SM} color="#ef4444" />
                <Text className="text-danger text-sm font-medium">
                  Decline
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}
