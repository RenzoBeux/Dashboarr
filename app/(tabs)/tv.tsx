import { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  Tv,
  Eye,
  EyeOff,
  Trash2,
  Info,
  ScanSearch,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  ScreenWrapper,
  useScreenBottomPadding,
} from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import {
  MonitoredLibraryGrid,
  MONITOR_FILTER_OPTIONS,
  type MonitorFilter,
} from "@/components/common/monitored-library-grid";
import {
  useSortStore,
  SORT_DEFAULTS,
  type SeriesSortKey,
} from "@/store/sort-store";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import {
  useSonarrSeries,
  useSonarrQueue,
  useSonarrCalendar,
  useSearchForSeries,
  useSearchForEpisodes,
  useSearchAllMissingEpisodes,
  useToggleSeriesMonitored,
  useDeleteSeries,
} from "@/hooks/use-sonarr";
import {
  BAR_KIND_COLOR,
  cornerColorFor,
  sonarrBarKind,
} from "@/lib/arr-poster-status";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useUiScale } from "@/hooks/use-ui-scale";
import { formatEpisodeCode, relativeDate, localDateKey } from "@/lib/utils";
import { mediumHaptic } from "@/lib/haptics";
import type { SonarrSeries, SonarrCalendarEntry } from "@/lib/types";

type SeriesSheetTarget =
  | { kind: "series"; item: SonarrSeries }
  | { kind: "calendar"; item: SonarrCalendarEntry }
  | null;

type Tab = "library" | "calendar";

const SORT_OPTIONS: { key: SeriesSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "next-airing-asc", label: "Next Airing" },
  { key: "title-asc", label: "Title: A → Z" },
  { key: "title-desc", label: "Title: Z → A" },
  { key: "year-desc", label: "Year: Newest First" },
  { key: "year-asc", label: "Year: Oldest First" },
  { key: "size-desc", label: "Size: Largest First" },
];

function compareSeries(
  a: SonarrSeries,
  b: SonarrSeries,
  sort: SeriesSortKey,
): number {
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
    case "size-desc": {
      const aSize = a.statistics?.sizeOnDisk ?? a.sizeOnDisk ?? 0;
      const bSize = b.statistics?.sizeOnDisk ?? b.sizeOnDisk ?? 0;
      return bSize - aSize;
    }
    case "next-airing-asc": {
      const aT = a.nextAiring ? new Date(a.nextAiring).getTime() : null;
      const bT = b.nextAiring ? new Date(b.nextAiring).getTime() : null;
      if (aT === null && bT === null)
        return (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title);
      if (aT === null) return 1;
      if (bT === null) return -1;
      return aT - bT;
    }
  }
}

export default function TVScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] =
    useState<MonitorFilter>("monitored");
  const sort = useSortStore((s) => s.series);
  const setSort = useSortStore((s) => s.setSeries);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<SeriesSheetTarget>(null);
  const [missingConfirmOpen, setMissingConfirmOpen] = useState(false);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["sonarr"]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const searchSeries = useSearchForSeries();
  const searchEpisodes = useSearchForEpisodes();
  const searchMissing = useSearchAllMissingEpisodes();
  const toggleMonitor = useToggleSeriesMonitored();
  const deleteMutation = useDeleteSeries();

  const sonarrHealth = healthData?.find((s) => s.id === "sonarr");

  const actions: ActionSheetAction[] = useMemo(() => {
    if (!sheetTarget) return [];

    if (sheetTarget.kind === "series") {
      const series = sheetTarget.item;
      return [
        {
          label: "Search",
          icon: <Icon icon={Search} size={18} color="#a1a1aa" />,
          onPress: () => searchSeries.mutate(series.id),
        },
        {
          label: series.monitored ? "Unmonitor" : "Monitor",
          icon: series.monitored ? (
            <Icon icon={EyeOff} size={18} color="#a1a1aa" />
          ) : (
            <Icon icon={Eye} size={18} color="#a1a1aa" />
          ),
          onPress: () =>
            toggleMonitor.mutate({
              seriesId: series.id,
              monitored: !series.monitored,
            }),
        },
        {
          label: "Open Details",
          icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
          onPress: () => router.push(`/series/${series.id}`),
        },
        {
          label: "Delete",
          icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
          variant: "danger",
          onPress: () => {
            Alert.alert("Delete Series", `Delete "${series.title}"?`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteMutation.mutate({ id: series.id }),
              },
              {
                text: "Delete + Files",
                style: "destructive",
                onPress: () =>
                  deleteMutation.mutate({ id: series.id, deleteFiles: true }),
              },
            ]);
          },
        },
      ];
    }

    // calendar
    const ep = sheetTarget.item;
    return [
      {
        label: "Search Episode",
        icon: <Icon icon={Search} size={18} color="#a1a1aa" />,
        onPress: () => searchEpisodes.mutate([ep.id]),
      },
      {
        label: "Open Series Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => router.push(`/series/${ep.seriesId}`),
      },
    ];
  }, [
    sheetTarget,
    searchSeries,
    searchEpisodes,
    toggleMonitor,
    deleteMutation,
    router,
  ]);

  const sheetTitle =
    sheetTarget?.kind === "series"
      ? sheetTarget.item.title
      : sheetTarget?.kind === "calendar"
        ? sheetTarget.item.series.title
        : undefined;

  const sheetSubtitle =
    sheetTarget?.kind === "calendar"
      ? `${formatEpisodeCode(
          sheetTarget.item.seasonNumber,
          sheetTarget.item.episodeNumber,
        )} — ${sheetTarget.item.title}`
      : undefined;

  const openSeriesSheet = (series: SonarrSeries) => {
    mediumHaptic();
    setSheetTarget({ kind: "series", item: series });
  };
  const openCalendarSheet = (ep: SonarrCalendarEntry) => {
    mediumHaptic();
    setSheetTarget({ kind: "calendar", item: ep });
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
      <View className="flex-row items-center justify-between">
        <ServiceHeader
          name="TV Shows"
          online={sonarrHealth?.online}
          serviceId="sonarr"
        />
        <View className="flex-row items-center">
          <Pressable
            onPress={handleSearchMissing}
            disabled={searchMissing.isPending}
            className="p-2 active:opacity-70"
            accessibilityLabel="Search all missing episodes"
          >
            <Icon icon={ScanSearch} size={ICON.LG} color="#a1a1aa" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/series/search")}
            className="p-2 active:opacity-70"
            accessibilityLabel="Add series"
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
        {(["library", "calendar"] as Tab[]).map((t) => (
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
              monitorFilter !== "monitored" || sort !== SORT_DEFAULTS.series
            }
          />
        </View>
      )}
    </>
  );

  return (
    <ScreenWrapper scrollable={false}>
      {tab === "library" && (
        <SeriesLibrary
          monitorFilter={monitorFilter}
          sort={sort}
          onLongPress={openSeriesSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "calendar" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshCtl}
          showsVerticalScrollIndicator={false}
        >
          {header}
          <CalendarView onLongPress={openCalendarSheet} />
        </ScrollView>
      )}

      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        actions={actions}
      />

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort shows"
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
        title="Search Missing Episodes"
        message="Sonarr will search every monitored missing episode in your library. This can queue a lot of grabs at once."
        icon={ScanSearch}
        confirmLabel="Search"
        onConfirm={() => {
          setMissingConfirmOpen(false);
          searchMissing.mutate();
        }}
        onCancel={() => setMissingConfirmOpen(false)}
      />
    </ScreenWrapper>
  );
}

function SeriesLibrary({
  monitorFilter,
  sort,
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  monitorFilter: MonitorFilter;
  sort: SeriesSortKey;
  onLongPress: (series: SonarrSeries) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<
    typeof MonitoredLibraryGrid
  >["contentContainerStyle"];
}) {
  const { data: series, isLoading, error } = useSonarrSeries();
  const { data: queue } = useSonarrQueue();
  const router = useRouter();

  const downloading = useMemo(
    () => new Set((queue?.records ?? []).map((r) => r.seriesId)),
    [queue],
  );

  return (
    <MonitoredLibraryGrid
      data={series}
      isLoading={isLoading}
      error={error}
      monitorFilter={monitorFilter}
      sort={sort}
      compare={compareSeries}
      serviceId="sonarr"
      placeholderIcon={Tv}
      nounPlural="shows"
      renderFooter={(s) => {
        // Sonarr v3 /series has no top-level seasonCount; read statistics (or
        // count non-special seasons), matching app/series/[id].tsx.
        const count =
          s.statistics?.seasonCount ??
          s.seasons.filter((x) => x.seasonNumber > 0).length ??
          0;
        return `${count} season${count !== 1 ? "s" : ""}`;
      }}
      posterStatus={(s) => ({
        barColor: BAR_KIND_COLOR[sonarrBarKind(s, downloading.has(s.id))],
        cornerColor: cornerColorFor(s.status),
      })}
      onItemPress={(s) => router.push(`/series/${s.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

function CalendarView({
  onLongPress,
}: {
  onLongPress: (ep: SonarrCalendarEntry) => void;
}) {
  const { data: episodes, isLoading, error } = useSonarrCalendar();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load calendar" />;
  }
  if (!episodes?.length) {
    return <EmptyState title="Nothing airing this week" />;
  }

  const grouped = new Map<string, SonarrCalendarEntry[]>();
  for (const ep of episodes) {
    const list = grouped.get(ep.airDate) ?? [];
    list.push(ep);
    grouped.set(ep.airDate, list);
  }

  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <View className="gap-4">
      {sortedDates.map((date) => {
        const entries = grouped.get(date)!;
        const isToday = date === localDateKey();

        return (
          <View key={date}>
            <Text
              className={`text-xs font-semibold mb-2 ${
                isToday ? "text-primary" : "text-zinc-500"
              }`}
            >
              {relativeDate(date)}
            </Text>
            <View className="gap-2">
              {entries.map((ep) => (
                <Card
                  key={ep.id}
                  onPress={() => router.push(`/series/${ep.seriesId}`)}
                  onLongPress={() => onLongPress(ep)}
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`w-1 h-10 rounded-full ${
                        ep.hasFile ? "bg-success" : "bg-zinc-600"
                      }`}
                    />
                    <View className="flex-1">
                      <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                        {ep.series.title}
                      </Text>
                      <Text className="text-zinc-500 text-xs">
                        {formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)} —{" "}
                        {ep.title}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
