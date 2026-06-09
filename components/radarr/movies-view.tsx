import { memo, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";
import { useRouter } from "expo-router";
import { Search, Film, Eye, EyeOff, Trash2, Info, ScanSearch } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  MonitoredLibraryGrid,
  MONITOR_FILTER_OPTIONS,
  type MonitorFilter,
} from "@/components/common/monitored-library-grid";
import { useSortStore, SORT_DEFAULTS, type MoviesSortKey } from "@/store/sort-store";

import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import {
  useRadarrMovies,
  useRadarrQueue,
  useWantedMissing,
  useSearchForMovie,
  useSearchAllMissingMovies,
  useToggleMovieMonitored,
  useDeleteMovie,
} from "@/hooks/use-radarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useUiScale } from "@/hooks/use-ui-scale";
import { mediumHaptic } from "@/lib/haptics";
import { BAR_KIND_COLOR, cornerColorFor, radarrBarKind } from "@/lib/arr-poster-status";
import type { RadarrMovie, RadarrQueueItem } from "@/lib/types";

type MovieSheetTarget =
  | { kind: "movie"; item: RadarrMovie }
  | { kind: "queue"; item: RadarrQueueItem }
  | null;

type Tab = "library" | "queue" | "wanted";

const SORT_OPTIONS: { key: MoviesSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "next-airing-asc", label: "Next Airing" },
  { key: "title-asc", label: "Title: A → Z" },
  { key: "title-desc", label: "Title: Z → A" },
  { key: "year-desc", label: "Year: Newest First" },
  { key: "year-asc", label: "Year: Oldest First" },
  { key: "release-desc", label: "Release Date: Newest First" },
  { key: "release-asc", label: "Release Date: Oldest First" },
  { key: "size-desc", label: "Size: Largest First" },
];

// Original release of the film: earliest of the cinema/digital/physical dates
// (theatrical typically comes first; min() picks it, but stays robust for
// straight-to-streaming titles that only carry a digital date).
function releaseTime(m: RadarrMovie): number | null {
  const times = [m.inCinemas, m.digitalRelease, m.physicalRelease]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  return times.length ? Math.min(...times) : null;
}

function nextReleaseTime(m: RadarrMovie): number | null {
  const times = [m.inCinemas, m.digitalRelease, m.physicalRelease]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  const now = Date.now();
  const future = times.filter((t) => t >= now);
  if (future.length) return Math.min(...future);
  return Math.max(...times);
}

function compareMovies(a: RadarrMovie, b: RadarrMovie, sort: MoviesSortKey): number {
  switch (sort) {
    case "added-desc":
      return new Date(b.added).getTime() - new Date(a.added).getTime();
    case "title-asc":
      return (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title);
    case "title-desc":
      return (b.sortTitle || b.title).localeCompare(a.sortTitle || a.title);
    case "year-desc":
      return b.year - a.year;
    case "year-asc":
      return a.year - b.year;
    case "release-desc":
    case "release-asc": {
      const aT = releaseTime(a);
      const bT = releaseTime(b);
      if (aT === null && bT === null)
        return (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title);
      if (aT === null) return 1;
      if (bT === null) return -1;
      return sort === "release-desc" ? bT - aT : aT - bT;
    }
    case "size-desc":
      return (b.sizeOnDisk ?? 0) - (a.sizeOnDisk ?? 0);
    case "next-airing-asc": {
      const aT = nextReleaseTime(a);
      const bT = nextReleaseTime(b);
      if (aT === null && bT === null)
        return (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title);
      if (aT === null) return 1;
      if (bT === null) return -1;
      const now = Date.now();
      const aFuture = aT >= now;
      const bFuture = bT >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aFuture ? aT - bT : bT - aT;
    }
  }
}

// Movies (Radarr) library/queue/wanted view. Extracted from the standalone
// Movies tab so it can also render inside the combined Library tab. `topSlot`
// renders above the service header (used by the standalone tab); `embedded`
// drops the screen chrome (SafeAreaView + demo banner) so the Library pager can
// own a single fixed safe-area + segmented control and just page this content.
export const MoviesView = memo(function MoviesView({
  topSlot,
  embedded = false,
}: {
  topSlot?: React.ReactNode;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
  const sort = useSortStore((s) => s.movies);
  const setSort = useSortStore((s) => s.setMovies);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<MovieSheetTarget>(null);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["radarr"]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const searchMutation = useSearchForMovie();
  const searchMissing = useSearchAllMissingMovies();
  const toggleMonitor = useToggleMovieMonitored();
  const deleteMutation = useDeleteMovie();
  const [missingConfirmOpen, setMissingConfirmOpen] = useState(false);

  const radarrHealth = healthData?.find((s) => s.id === "radarr");

  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    title: string;
    tmdbId?: number;
    withFiles: boolean;
  } | null>(null);
  // Set from the actions sheet, promoted to the confirm modal only after the
  // sheet has fully closed — never stack two native modals on iOS.
  const deleteIntent = useRef<{
    id: number;
    title: string;
    tmdbId?: number;
    withFiles: boolean;
  } | null>(null);

  const sheetMovie: RadarrMovie | undefined =
    sheetTarget?.kind === "movie"
      ? sheetTarget.item
      : sheetTarget?.kind === "queue"
        ? sheetTarget.item.movie
        : undefined;

  const actions: ActionSheetAction[] = useMemo(() => {
    if (!sheetMovie) return [];
    const movie = sheetMovie;
    return [
      {
        label: "Search",
        icon: <Icon icon={Search} size={18} color="#a1a1aa" />,
        onPress: () => searchMutation.mutate(movie.id),
      },
      {
        label: movie.monitored ? "Unmonitor" : "Monitor",
        icon: movie.monitored ? (
          <Icon icon={EyeOff} size={18} color="#a1a1aa" />
        ) : (
          <Icon icon={Eye} size={18} color="#a1a1aa" />
        ),
        onPress: () =>
          toggleMonitor.mutate({ movieId: movie.id, monitored: !movie.monitored }),
      },
      {
        label: "Open Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => router.push(`/movie/${movie.id}`),
      },
      {
        label: "Delete",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () => {
          deleteIntent.current = {
            id: movie.id,
            title: movie.title,
            tmdbId: movie.tmdbId,
            withFiles: false,
          };
        },
      },
      {
        label: "Delete + Files",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () => {
          deleteIntent.current = {
            id: movie.id,
            title: movie.title,
            tmdbId: movie.tmdbId,
            withFiles: true,
          };
        },
      },
    ];
  }, [sheetMovie, searchMutation, toggleMonitor, deleteMutation, router]);

  const openMovieSheet = (movie: RadarrMovie) => {
    mediumHaptic();
    setSheetTarget({ kind: "movie", item: movie });
  };
  const openQueueSheet = (item: RadarrQueueItem) => {
    if (!item.movie) return;
    mediumHaptic();
    setSheetTarget({ kind: "queue", item });
  };

  const handleSearchMissing = () => {
    mediumHaptic();
    setMissingConfirmOpen(true);
  };

  // Horizontal padding comes from ScreenWrapper's px-4; only vertical padding
  // here. pt = 0.5rem, matched at runtime so accessibility scale applies.
  const contentContainerStyle = {
    paddingTop: 7 * uiScale,
    paddingBottom: bottomPadding,
  };

  const refreshCtl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#3b82f6"
      colors={["#3b82f6"]}
      progressBackgroundColor="#18181b"
    />
  );

  const header = (
    <>
      {topSlot}
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="Movies" online={radarrHealth?.online} serviceId="radarr" />
        <View className="flex-row items-center">
          {tab === "wanted" && (
            <Pressable
              onPress={handleSearchMissing}
              disabled={searchMissing.isPending}
              className="p-2 active:opacity-70"
              accessibilityLabel="Search all missing movies"
            >
              <Icon icon={ScanSearch} size={ICON.LG} color="#a1a1aa" />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/movie/search")}
            className="p-2 active:opacity-70"
            accessibilityLabel="Add movie"
          >
            <Icon icon={Search} size={ICON.LG} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {(["library", "queue", "wanted"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>

      {tab === "library" && (
        <View className="mb-4">
          <FilterSortButton
            summary={`${MONITOR_FILTER_OPTIONS.find((f) => f.value === monitorFilter)?.label ?? ""} · ${SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ""}`}
            onPress={() => setFilterSortOpen(true)}
            active={
              monitorFilter !== "monitored" || sort !== SORT_DEFAULTS.movies
            }
          />
        </View>
      )}
    </>
  );

  const body = (
    <>
      {tab === "library" && (
        <MovieLibrary
          monitorFilter={monitorFilter}
          sort={sort}
          onLongPress={openMovieSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "wanted" && (
        <MovieWanted
          onLongPress={openMovieSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "queue" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshCtl}
          showsVerticalScrollIndicator={false}
        >
          {header}
          <MovieQueue onLongPress={openQueueSheet} />
        </ScrollView>
      )}

      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
        onClosed={() => {
          if (deleteIntent.current) {
            setPendingDelete(deleteIntent.current);
            deleteIntent.current = null;
          }
        }}
        title={sheetMovie?.title}
        subtitle={sheetMovie ? String(sheetMovie.year) : undefined}
        actions={actions}
      />

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort movies"
        filterOptions={MONITOR_FILTER_OPTIONS.map((f) => ({
          key: f.value,
          label: f.label,
        }))}
        filterValue={monitorFilter}
        onFilterChange={setMonitorFilter}
        sortOptions={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        sortValue={sort}
        onSortChange={setSort}
      />

      <ConfirmModal
        visible={missingConfirmOpen}
        title="Search Missing Movies"
        message="Radarr will search every monitored missing movie in your library. This can queue a lot of grabs at once."
        icon={ScanSearch}
        confirmLabel="Search"
        onConfirm={() => {
          setMissingConfirmOpen(false);
          searchMissing.mutate();
        }}
        onCancel={() => setMissingConfirmOpen(false)}
      />

      <ConfirmModal
        visible={pendingDelete !== null}
        title={pendingDelete?.withFiles ? "Delete movie + files?" : "Delete movie?"}
        message={
          pendingDelete
            ? pendingDelete.withFiles
              ? `Remove "${pendingDelete.title}" from Radarr and delete files from disk. This can't be undone.`
              : `Remove "${pendingDelete.title}" from Radarr. Files on disk will be kept.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={pendingDelete?.withFiles ? "Delete + Files" : "Delete"}
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate({
              id: pendingDelete.id,
              deleteFiles: pendingDelete.withFiles,
              tmdbId: pendingDelete.tmdbId,
            });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );

  return embedded ? (
    <View className="flex-1 px-4">{body}</View>
  ) : (
    <ScreenWrapper scrollable={false}>{body}</ScreenWrapper>
  );
});

function MovieLibrary({
  monitorFilter,
  sort,
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  monitorFilter: MonitorFilter;
  sort: MoviesSortKey;
  onLongPress: (movie: RadarrMovie) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<typeof MonitoredLibraryGrid>["contentContainerStyle"];
}) {
  const { data: movies, isLoading, error } = useRadarrMovies();
  const { data: queue } = useRadarrQueue();
  const router = useRouter();

  const downloading = useMemo(
    () => new Set((queue?.records ?? []).map((r) => r.movieId)),
    [queue],
  );

  return (
    <MonitoredLibraryGrid
      data={movies}
      isLoading={isLoading}
      error={error}
      monitorFilter={monitorFilter}
      sort={sort}
      compare={compareMovies}
      serviceId="radarr"
      placeholderIcon={Film}
      nounPlural="movies"
      renderFooter={(m) => String(m.year)}
      posterStatus={(m) => ({
        barColor: BAR_KIND_COLOR[radarrBarKind(m, downloading.has(m.id))],
        cornerColor: cornerColorFor(m.status),
      })}
      onItemPress={(m) => router.push(`/movie/${m.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

function MovieQueue({ onLongPress }: { onLongPress: (item: RadarrQueueItem) => void }) {
  const { data: queue, isLoading, error } = useRadarrQueue();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load queue" />;
  }
  if (!queue?.records.length) {
    return <EmptyState title="Queue empty" message="No movies downloading" />;
  }

  return (
    <View className="gap-2">
      {queue.records.map((item) => (
        <Card
          key={item.id}
          onPress={() => item.movie && router.push(`/movie/${item.movie.id}`)}
          onLongPress={item.movie ? () => onLongPress(item) : undefined}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
              {item.title}
            </Text>
            <Badge label={item.quality.quality.name} />
          </View>
          {item.timeleft && (
            <Text className="text-zinc-500 text-xs mt-1">ETA {item.timeleft}</Text>
          )}
        </Card>
      ))}
    </View>
  );
}

function MovieWanted({
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  onLongPress: (movie: RadarrMovie) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<
    typeof MonitoredLibraryGrid
  >["contentContainerStyle"];
}) {
  const { data: wanted, isLoading, error } = useWantedMissing();
  const { data: queue } = useRadarrQueue();
  const router = useRouter();

  const downloading = useMemo(
    () => new Set((queue?.records ?? []).map((r) => r.movieId)),
    [queue],
  );

  const count = wanted?.totalRecords ?? 0;
  const header = (
    <>
      {listHeader}
      {!isLoading && (
        <View className="mb-4">
          <Text className="text-zinc-400 text-sm">
            {count} missing {count === 1 ? "movie" : "movies"}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <MonitoredLibraryGrid
      data={wanted?.records}
      isLoading={isLoading}
      error={error}
      monitorFilter="all"
      sort="title-asc"
      compare={compareMovies}
      serviceId="radarr"
      placeholderIcon={Film}
      nounPlural="missing movies"
      renderFooter={(m) => String(m.year)}
      posterStatus={(m) => ({
        barColor: BAR_KIND_COLOR[radarrBarKind(m, downloading.has(m.id))],
        cornerColor: cornerColorFor(m.status),
      })}
      onItemPress={(m) => router.push(`/movie/${m.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
