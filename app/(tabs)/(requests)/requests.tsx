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
  SlidersHorizontal,
  MoreHorizontal,
  Trash2,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import {
  useSortStore,
  SORT_DEFAULTS,
  type RequestsSortKey,
} from "@/store/sort-store";
import { ICON } from "@/lib/constants";
import { successHaptic, errorHaptic, mediumHaptic } from "@/lib/haptics";
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
  useOverseerrUpcomingTV,
  useOverseerrRecentlyAdded,
  useOverseerrGenreSlider,
  useOverseerrDiscoverSliders,
  useOverseerrCustomSlider,
  useApproveRequest,
  useDeclineRequest,
  useDeleteRequest,
  useDeleteMedia,
} from "@/hooks/use-overseerr";
import { getPosterUrl, getBackdropUrl } from "@/services/overseerr-api";
import {
  NETWORKS,
  STUDIOS,
  getDiscoverLogoUrl,
  BUILTIN_SLIDER_LABELS,
  type DiscoverCollectionKind,
} from "@/lib/overseerr-discover";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import {
  DiscoverSliderType,
  type OverseerrRequest,
  type OverseerrMediaResult,
  type OverseerrMediaType,
  type OverseerrMediaStatus,
  type DiscoverSlider,
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
  4: "success",
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

type OpenCollection = (
  kind: DiscoverCollectionKind,
  item: DiscoverSliderItem,
  mediaType?: OverseerrMediaType,
) => void;

// The Discover layout is driven by Seerr's own discover-settings (the same
// sliders the Seerr/Jellyseerr web UI shows). We fetch the slider config and
// render each enabled slider in order, mapping its type to a renderer. When the
// config is unavailable (non-admin key, older Seerr, or still loading) we fall
// back to the built-in layout so the tab is never blank.
function DiscoverTab({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const router = useRouter();
  const { data: sliders, isLoading } = useOverseerrDiscoverSliders();

  const enabledSliders = useMemo(
    () =>
      (sliders ?? [])
        .filter((s) => s.enabled)
        .sort((a, b) => a.order - b.order),
    [sliders],
  );

  const openCollection = useCallback<OpenCollection>(
    (kind, item, mediaType) => {
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

  // While the config is loading for the first time, show skeleton rows. This
  // avoids painting the legacy layout and then swapping to the config layout a
  // moment later (the Customize button + extra sliders popping in mid-render).
  if (isLoading) {
    return <DiscoverSkeleton />;
  }

  // Query settled without usable config — the instance is disabled, the key
  // isn't an admin key (403), or the server returned nothing. Render the
  // built-in layout (with its own skeletons) so the tab is never blank.
  if (!sliders || sliders.length === 0) {
    return (
      <LegacyDiscoverLayout
        onItemPress={onItemPress}
        openCollection={openCollection}
      />
    );
  }

  return (
    <View>
      <View className="flex-row justify-end mb-2">
        <Pressable
          onPress={() => router.push("/overseerr/customize-discover")}
          hitSlop={8}
          className="flex-row items-center gap-1.5 active:opacity-70"
        >
          <Icon icon={SlidersHorizontal} size={16} color="#a1a1aa" />
          <Text className="text-zinc-400 text-sm">Customize</Text>
        </Pressable>
      </View>

      {enabledSliders.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Compass} size={32} color="#71717a" />}
          title="No sections shown"
          message="Every Discover section is hidden. Tap Customize to turn some back on."
        />
      ) : (
        enabledSliders.map((slider) => (
          <DiscoverSliderRow
            key={slider.id}
            slider={slider}
            onItemPress={onItemPress}
            openCollection={openCollection}
          />
        ))
      )}
    </View>
  );
}

// Placeholder shown while the discover-settings config is loading, so the tab
// fades from skeletons straight into the final layout instead of flashing the
// legacy layout first. Mirrors MediaRow's skeleton (7.85rem poster, h-165) so
// the rows don't jump when real content arrives.
function DiscoverSkeleton() {
  return (
    <View>
      {Array.from({ length: 4 }).map((_, row) => (
        <View key={row} className="mb-6">
          <View className="mb-3 px-1">
            <Skeleton width="40%" height={16} borderRadius={4} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} className="w-[7.85rem]">
                  <Skeleton width="100%" height={165} borderRadius={12} />
                  <View className="mt-2">
                    <Skeleton width="80%" height={12} borderRadius={4} />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

// Renders the built-in sliders in Seerr's default order. Used as a fallback
// when the discover-settings config can't be loaded.
function LegacyDiscoverLayout({
  onItemPress,
  openCollection,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
  openCollection: OpenCollection;
}) {
  return (
    <View>
      <TrendingRow onItemPress={onItemPress} />
      <PopularMoviesRow onItemPress={onItemPress} />
      <PopularTVRow onItemPress={onItemPress} />
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
      <GenreSliderRow mediaType="movie" openCollection={openCollection} />
      <GenreSliderRow mediaType="tv" openCollection={openCollection} />
      <UpcomingMoviesRow onItemPress={onItemPress} />
    </View>
  );
}

// Maps one slider to its renderer. Each renderer family is its own component so
// every component calls exactly its own hooks unconditionally (Rules of Hooks).
// Types without a Discover renderer (RECENT_REQUESTS, PLEX_WATCHLIST, and any
// future/Jellyseerr-only type) fall through to null and are simply skipped.
function DiscoverSliderRow({
  slider,
  onItemPress,
  openCollection,
}: {
  slider: DiscoverSlider;
  onItemPress: (item: OverseerrMediaResult) => void;
  openCollection: OpenCollection;
}) {
  switch (slider.type) {
    case DiscoverSliderType.TRENDING:
      return <TrendingRow onItemPress={onItemPress} />;
    case DiscoverSliderType.POPULAR_MOVIES:
      return <PopularMoviesRow onItemPress={onItemPress} />;
    case DiscoverSliderType.POPULAR_TV:
      return <PopularTVRow onItemPress={onItemPress} />;
    case DiscoverSliderType.UPCOMING_MOVIES:
      return <UpcomingMoviesRow onItemPress={onItemPress} />;
    case DiscoverSliderType.UPCOMING_TV:
      return <UpcomingTVRow onItemPress={onItemPress} />;
    case DiscoverSliderType.RECENTLY_ADDED:
      return <RecentlyAddedRow onItemPress={onItemPress} />;
    case DiscoverSliderType.MOVIE_GENRES:
      return <GenreSliderRow mediaType="movie" openCollection={openCollection} />;
    case DiscoverSliderType.TV_GENRES:
      return <GenreSliderRow mediaType="tv" openCollection={openCollection} />;
    case DiscoverSliderType.NETWORKS:
      return (
        <DiscoverCollectionSlider
          title={BUILTIN_SLIDER_LABELS[DiscoverSliderType.NETWORKS] ?? "Networks"}
          variant="logo"
          items={NETWORK_ITEMS}
          onItemPress={(item) => openCollection("network", item)}
        />
      );
    case DiscoverSliderType.STUDIOS:
      return (
        <DiscoverCollectionSlider
          title={BUILTIN_SLIDER_LABELS[DiscoverSliderType.STUDIOS] ?? "Studios"}
          variant="logo"
          items={STUDIO_ITEMS}
          onItemPress={(item) => openCollection("studio", item)}
        />
      );
    case DiscoverSliderType.TMDB_MOVIE_GENRE:
    case DiscoverSliderType.TMDB_TV_GENRE:
    case DiscoverSliderType.TMDB_STUDIO:
    case DiscoverSliderType.TMDB_NETWORK:
    case DiscoverSliderType.TMDB_MOVIE_KEYWORD:
    case DiscoverSliderType.TMDB_TV_KEYWORD:
    case DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES:
    case DiscoverSliderType.TMDB_TV_STREAMING_SERVICES:
    case DiscoverSliderType.TMDB_SEARCH:
      return <CustomRow slider={slider} onItemPress={onItemPress} />;
    default:
      return null;
  }
}

// ─── Discover slider renderers ─────────────────────────────────

function TrendingRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrTrending();
  return (
    <MediaRow
      title="Trending"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function PopularMoviesRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrPopularMovies();
  return (
    <MediaRow
      title="Popular Movies"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function PopularTVRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrPopularTV();
  return (
    <MediaRow
      title="Popular TV Shows"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function UpcomingMoviesRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrUpcomingMovies();
  return (
    <MediaRow
      title="Upcoming Movies"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function UpcomingTVRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrUpcomingTV();
  return (
    <MediaRow
      title="Upcoming TV"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function RecentlyAddedRow({
  onItemPress,
}: {
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrRecentlyAdded();
  return (
    <MediaRow
      title="Recently Added"
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
  );
}

function GenreSliderRow({
  mediaType,
  openCollection,
}: {
  mediaType: OverseerrMediaType;
  openCollection: OpenCollection;
}) {
  const q = useOverseerrGenreSlider(mediaType);
  const items = useMemo(() => toGenreItems(q.data), [q.data]);
  return (
    <DiscoverCollectionSlider
      title={mediaType === "movie" ? "Movie Genres" : "TV Genres"}
      variant="genre"
      items={items}
      isLoading={q.isLoading}
      onItemPress={(item) => openCollection("genre", item, mediaType)}
    />
  );
}

// Custom (user-created) sliders carry a title and a data payload; the hook maps
// the type+data to the right discover query. A failed query yields an empty
// MediaRow (renders nothing) rather than breaking the whole tab.
function CustomRow({
  slider,
  onItemPress,
}: {
  slider: DiscoverSlider;
  onItemPress: (item: OverseerrMediaResult) => void;
}) {
  const q = useOverseerrCustomSlider(slider);
  return (
    <MediaRow
      title={slider.title ?? "Discover"}
      items={q.data?.results}
      isLoading={q.isLoading}
      onItemPress={onItemPress}
    />
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

// Identity of the row whose ActionSheet / confirm is open. Carries both ids the
// two actions need (requestId for delete-request, mediaId for remove-media)
// plus the media status used to decide whether "Remove media" is offered.
type RowTarget = {
  requestId: number;
  mediaId: number;
  mediaStatus: OverseerrMediaStatus;
  title: string;
};
type ConfirmIntent = RowTarget & { mode: "deleteRequest" | "removeMedia" };

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
  const del = useDeleteRequest();
  const removeMedia = useDeleteMedia();

  // The tapped row drives the ActionSheet contents; the confirm step + mutation
  // read their target from the flow payload (sticky through the dismiss
  // animation), so the chain survives the iOS modal teardown (issue #83).
  const [sheetTarget, setSheetTarget] = useState<RowTarget | null>(null);
  const flow = useModalFlow<{ actions: void; confirm: ConfirmIntent }>();

  const requests = data?.results ?? [];

  const busy =
    approve.isPending ||
    decline.isPending ||
    del.isPending ||
    removeMedia.isPending;

  const openRowSheet = (target: RowTarget) => {
    mediumHaptic();
    setSheetTarget(target);
    flow.open("actions");
  };

  const actions: ActionSheetAction[] = useMemo(() => {
    if (!sheetTarget) return [];
    const t = sheetTarget;
    const list: ActionSheetAction[] = [
      {
        label: "Delete request",
        icon: <Icon icon={Trash2} size={ICON.MD} color="#ef4444" />,
        variant: "danger",
        onPress: () => flow.open("confirm", { ...t, mode: "deleteRequest" }),
      },
    ];
    // "Remove media" only applies once media exists (processing / partial /
    // available); pending or declined requests have nothing to untrack.
    if (t.mediaStatus >= 3) {
      list.push({
        label: "Remove media",
        icon: <Icon icon={Film} size={ICON.MD} color="#ef4444" />,
        variant: "danger",
        onPress: () => flow.open("confirm", { ...t, mode: "removeMedia" }),
      });
    }
    return list;
  }, [sheetTarget, flow]);

  const pending = flow.payload("confirm");
  const onConfirm = () => {
    // Guard against a double-tap firing a second DELETE during the confirm's
    // fade-out (the payload stays sticky and the button isn't disabled mid-press).
    if (!pending || del.isPending || removeMedia.isPending) return;
    flow.close();
    if (pending.mode === "deleteRequest") {
      del.mutate(pending.requestId, {
        onSuccess: () => toast("Request deleted"),
        onError: (err) => toastError("Failed to delete request", err),
      });
    } else {
      removeMedia.mutate(pending.mediaId, {
        onSuccess: () => toast("Media removed"),
        onError: (err) => toastError("Failed to remove media", err),
      });
    }
  };

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
              onMore={(title) =>
                openRowSheet({
                  requestId: req.id,
                  mediaId: req.media.id,
                  mediaStatus: req.media.status,
                  title,
                })
              }
              busy={busy}
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

      <ActionSheet
        {...flow.bind("actions")}
        title={sheetTarget?.title}
        actions={actions}
      />

      <ConfirmModal
        {...flow.bind("confirm")}
        title={pending?.mode === "removeMedia" ? "Remove media?" : "Delete request?"}
        message={
          pending
            ? pending.mode === "removeMedia"
              ? `Remove "${pending.title}" from Seerr? It can be requested again afterwards. This does not delete files from your server.`
              : `Delete the request for "${pending.title}"? This removes it from your Seerr requests.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={pending?.mode === "removeMedia" ? "Remove" : "Delete"}
        onConfirm={onConfirm}
      />
    </View>
  );
}

function RequestCard({
  request,
  onApprove,
  onDecline,
  onMore,
  busy,
}: {
  request: OverseerrRequest;
  onApprove: () => void;
  onDecline: () => void;
  onMore: (title: string) => void;
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
            <View className="flex-row items-center gap-1">
              <Badge label={statusLabel} variant={statusVariant} />
              <Pressable
                onPress={() => onMore(title)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Request actions"
                className="p-0.5 active:opacity-70"
              >
                <Icon icon={MoreHorizontal} size={ICON.MD} color="#a1a1aa" />
              </Pressable>
            </View>
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
