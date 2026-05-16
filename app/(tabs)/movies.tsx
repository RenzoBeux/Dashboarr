import { useState, useMemo } from "react";
import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Search, Film, Eye, EyeOff, Trash2, Info } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
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
  useToggleMovieMonitored,
  useDeleteMovie,
} from "@/hooks/use-radarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { mediumHaptic } from "@/lib/haptics";
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
  { key: "size-desc", label: "Size: Largest First" },
];

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

export default function MoviesScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
  const sort = useSortStore((s) => s.movies);
  const setSort = useSortStore((s) => s.setMovies);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<MovieSheetTarget>(null);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["radarr"]]);

  const searchMutation = useSearchForMovie();
  const toggleMonitor = useToggleMovieMonitored();
  const deleteMutation = useDeleteMovie();

  const radarrHealth = healthData?.find((s) => s.id === "radarr");

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
          Alert.alert("Delete Movie", `Delete "${movie.title}"?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                deleteMutation.mutate({ id: movie.id, tmdbId: movie.tmdbId }),
            },
            {
              text: "Delete + Files",
              style: "destructive",
              onPress: () =>
                deleteMutation.mutate({
                  id: movie.id,
                  deleteFiles: true,
                  tmdbId: movie.tmdbId,
                }),
            },
          ]);
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

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="Movies" online={radarrHealth?.online} serviceId="radarr" />
        <Pressable
          onPress={() => router.push("/movie/search")}
          className="p-2 active:opacity-70"
        >
          <Icon icon={Search} size={ICON.LG} color="#a1a1aa" />
        </Pressable>
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

      {tab === "library" && <MovieLibrary monitorFilter={monitorFilter} sort={sort} onLongPress={openMovieSheet} />}
      {tab === "queue" && <MovieQueue onLongPress={openQueueSheet} />}
      {tab === "wanted" && <MovieWanted />}

      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
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
    </ScreenWrapper>
  );
}

function MovieLibrary({
  monitorFilter,
  sort,
  onLongPress,
}: {
  monitorFilter: MonitorFilter;
  sort: MoviesSortKey;
  onLongPress: (movie: RadarrMovie) => void;
}) {
  const { data: movies, isLoading, error } = useRadarrMovies();
  const router = useRouter();

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
      onItemPress={(m) => router.push(`/movie/${m.id}`)}
      onItemLongPress={onLongPress}
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

function MovieWanted() {
  const { data: wanted, isLoading } = useWantedMissing();

  if (isLoading) return <SkeletonCardContent rows={2} />;

  return (
    <View>
      <Text className="text-zinc-400 text-sm mb-3">
        {wanted?.totalRecords ?? 0} missing movies
      </Text>
      <EmptyState
        title="Full wanted list"
        message="View in Radarr for complete list"
      />
    </View>
  );
}
