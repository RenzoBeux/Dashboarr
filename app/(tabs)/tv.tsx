import { useState, useMemo } from "react";
import { View, Text, Pressable, Alert, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Search,
  Tv,
  Eye,
  EyeOff,
  Trash2,
  Info,
  ArrowUpDown,
  Check,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { SortButton } from "@/components/ui/sort-button";
import { useSortStore, SORT_DEFAULTS, type SeriesSortKey } from "@/store/sort-store";
import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import {
  useSonarrSeries,
  useSonarrCalendar,
  useSearchForSeries,
  useSearchForEpisodes,
  useToggleSeriesMonitored,
  useDeleteSeries,
} from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatEpisodeCode, relativeDate, localDateKey } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import { usePosterCellWidth } from "@/hooks/use-poster-cell";
import { mediumHaptic } from "@/lib/haptics";
import type { SonarrSeries, SonarrCalendarEntry } from "@/lib/types";

type SeriesSheetTarget =
  | { kind: "series"; item: SonarrSeries }
  | { kind: "calendar"; item: SonarrCalendarEntry }
  | null;

type Tab = "library" | "calendar";
type MonitorFilter = "monitored" | "unmonitored" | "all";

const MONITOR_FILTERS: { value: MonitorFilter; label: string }[] = [
  { value: "monitored", label: "Monitored" },
  { value: "unmonitored", label: "Unmonitored" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS: { key: SeriesSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "title-asc", label: "Title: A → Z" },
  { key: "title-desc", label: "Title: Z → A" },
  { key: "year-desc", label: "Year: Newest First" },
  { key: "year-asc", label: "Year: Oldest First" },
  { key: "size-desc", label: "Size: Largest First" },
];

function compareSeries(a: SonarrSeries, b: SonarrSeries, sort: SeriesSortKey): number {
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
  }
}

export default function TVScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
  const sort = useSortStore((s) => s.series);
  const setSort = useSortStore((s) => s.setSeries);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<SeriesSheetTarget>(null);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["sonarr"]]);

  const searchSeries = useSearchForSeries();
  const searchEpisodes = useSearchForEpisodes();
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
  }, [sheetTarget, searchSeries, searchEpisodes, toggleMonitor, deleteMutation, router]);

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

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="TV Shows" online={sonarrHealth?.online} serviceId="sonarr" />
        <Pressable
          onPress={() => router.push("/series/search")}
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
        <View className="flex-row items-center gap-2 mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="flex-1"
          >
            {MONITOR_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                label={f.label}
                selected={monitorFilter === f.value}
                onPress={() => setMonitorFilter(f.value)}
              />
            ))}
          </ScrollView>
          <SortButton
            onPress={() => setSortSheetOpen(true)}
            active={sort !== SORT_DEFAULTS.series}
          />
        </View>
      )}

      {tab === "library" && (
        <SeriesLibrary
          monitorFilter={monitorFilter}
          sort={sort}
          onLongPress={openSeriesSheet}
        />
      )}
      {tab === "calendar" && <CalendarView onLongPress={openCalendarSheet} />}

      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        actions={actions}
      />

      <ActionSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort shows"
        actions={SORT_OPTIONS.map<ActionSheetAction>((opt) => ({
          label: opt.label,
          icon:
            sort === opt.key ? (
              <Icon icon={Check} size={18} color="#3b82f6" />
            ) : (
              <Icon icon={ArrowUpDown} size={18} color="#71717a" />
            ),
          onPress: () => setSort(opt.key),
        }))}
      />
    </ScreenWrapper>
  );
}

function SeriesLibrary({
  monitorFilter,
  sort,
  onLongPress,
}: {
  monitorFilter: MonitorFilter;
  sort: SeriesSortKey;
  onLongPress: (series: SonarrSeries) => void;
}) {
  const { data: series, isLoading, error } = useSonarrSeries();
  const router = useRouter();
  const cellWidth = usePosterCellWidth();

  if (isLoading) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={{ width: cellWidth }}>
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    );
  }
  if (error) {
    return <ErrorBanner error={error} title="Failed to load library" />;
  }
  if (!series?.length) {
    return <EmptyState icon={<Icon icon={Tv} size={32} color="#71717a" />} title="No shows in library" />;
  }

  const filtered = series.filter((s) => {
    if (monitorFilter === "monitored") return s.monitored;
    if (monitorFilter === "unmonitored") return !s.monitored;
    return true;
  });

  if (!filtered.length) {
    const title =
      monitorFilter === "monitored"
        ? "No monitored shows"
        : monitorFilter === "unmonitored"
          ? "No unmonitored shows"
          : "No shows in library";
    return <EmptyState icon={<Icon icon={Tv} size={32} color="#71717a" />} title={title} />;
  }

  const sorted = [...filtered].sort((a, b) => compareSeries(a, b, sort));

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((show) => (
        <SeriesPoster
          key={show.id}
          series={show}
          onPress={() => router.push(`/series/${show.id}`)}
          onLongPress={() => onLongPress(show)}
        />
      ))}
    </View>
  );
}

function SeriesPoster({
  series,
  onPress,
  onLongPress,
}: {
  series: SonarrSeries;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const poster = series.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "sonarr");
  const cellWidth = usePosterCellWidth();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ width: cellWidth }}
      className="active:opacity-80"
    >
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={src}
          onError={onError}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Icon icon={Tv} size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-sm mt-1" numberOfLines={1}>
        {series.title}
      </Text>
      <Text className="text-zinc-600 text-xs">
        {series.seasonCount} season{series.seasonCount !== 1 ? "s" : ""}
      </Text>
    </Pressable>
  );
}

function CalendarView({ onLongPress }: { onLongPress: (ep: SonarrCalendarEntry) => void }) {
  const { data: episodes, isLoading, error } = useSonarrCalendar();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load calendar" />;
  }
  if (!episodes?.length) {
    return <EmptyState title="Nothing airing this week" />;
  }

  // Group by date
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
