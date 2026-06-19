import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  Server,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ICON, POLLING_INTERVALS, SERVICE_DEFAULTS } from "@/lib/constants";
import {
  getCalendar as getSonarrCalendar,
  getQueue as getSonarrQueue,
} from "@/services/sonarr-api";
import {
  getCalendar as getRadarrCalendar,
  getQueue as getRadarrQueue,
} from "@/services/radarr-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { CalendarEventRow } from "@/components/common/calendar-event-row";
import {
  radarrBarKind,
  sonarrEpisodeBarKind,
  BAR_KIND_COLOR,
} from "@/lib/arr-poster-status";
import {
  airDateKey,
  formatEpisodeCode,
  localDateKey,
  releaseDateKey,
} from "@/lib/utils";
import { lightHaptic } from "@/lib/haptics";
import { getBoolean, setBoolean, getString, setString } from "@/store/storage";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";
import type { SonarrCalendarEntry, RadarrMovie } from "@/lib/types";

const INCLUDE_UNMONITORED_KEY = "ui.calendar.includeUnmonitored";
const SONARR_INSTANCE_FILTER_KEY = "ui.calendar.sonarrInstance";
const RADARR_INSTANCE_FILTER_KEY = "ui.calendar.radarrInstance";

// "all" = fan out across every enabled instance of that kind (original
// behavior); any other string is a ServiceInstance UUID — scope to that one.
type InstanceFilter = string;
const ALL = "all";

type Filter = "all" | "tv" | "movies";

type CalendarItem =
  | {
      type: "episode";
      date: string;
      data: SonarrCalendarEntry;
      instanceId: string;
    }
  | {
      type: "movie";
      date: string;
      data: RadarrMovie;
      instanceId: string;
    };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Fetch the full visible grid (incl. prev/next-month padding cells) padded
// ±1 day, mirroring Sonarr's web UI. The padding keeps boundary episodes
// whose UTC day differs from the local day inside the server-side range
// filter; the extra day on `end` also matters because the *arr APIs treat a
// date-only end as midnight (exclusive of that day's airings).
function getFetchRange(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - first.getDay() - 1);
  const end = new Date(year, month, last.getDate() + (6 - last.getDay()) + 1);
  return {
    start: localDateKey(start),
    end: localDateKey(end),
  };
}

function getCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: { day: number; dateKey: string; inMonth: boolean }[] = [];

  // Previous month padding
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevLast - i;
    const date = new Date(year, month - 1, d);
    cells.push({ day: d, dateKey: localDateKey(date), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, dateKey: localDateKey(date), inMonth: true });
  }

  // Next month padding
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      cells.push({ day: d, dateKey: localDateKey(date), inMonth: false });
    }
  }

  return cells;
}

export default function CalendarScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(localDateKey(today));
  const [filter, setFilter] = useState<Filter>("all");
  const [includeUnmonitored, setIncludeUnmonitoredState] = useState(() =>
    getBoolean(INCLUDE_UNMONITORED_KEY),
  );

  const setIncludeUnmonitored = (value: boolean) => {
    setIncludeUnmonitoredState(value);
    setBoolean(INCLUDE_UNMONITORED_KEY, value);
  };

  const attachedInstances = useAttachedInstances();
  const sonarrAllRaw = useEnabledInstances("sonarr");
  const radarrAllRaw = useEnabledInstances("radarr");
  // Workspace filter at per-instance granularity: only fan out to instances
  // attached to the active dashboard. A "Movies-only" workspace that
  // attached just Radarr-Home won't surface Sonarr at all, and won't pull
  // calendar data from Radarr-Cabin either.
  const sonarrAll = useMemo(
    () => sonarrAllRaw.filter((i) => attachedInstances.has(i.id)),
    [sonarrAllRaw, attachedInstances],
  );
  const radarrAll = useMemo(
    () => radarrAllRaw.filter((i) => attachedInstances.has(i.id)),
    [radarrAllRaw, attachedInstances],
  );

  // Persisted per-kind instance filter. Default to "all" so existing single-
  // instance users see no behavior change; multi-instance users who pick a
  // specific instance scope queries (and failure banners) to that one.
  const [sonarrFilter, setSonarrFilterState] = useState<InstanceFilter>(
    () => getString(SONARR_INSTANCE_FILTER_KEY) ?? ALL,
  );
  const [radarrFilter, setRadarrFilterState] = useState<InstanceFilter>(
    () => getString(RADARR_INSTANCE_FILTER_KEY) ?? ALL,
  );

  const setSonarrFilter = (value: InstanceFilter) => {
    setSonarrFilterState(value);
    setString(SONARR_INSTANCE_FILTER_KEY, value);
  };
  const setRadarrFilter = (value: InstanceFilter) => {
    setRadarrFilterState(value);
    setString(RADARR_INSTANCE_FILTER_KEY, value);
  };

  // Reconcile a stored UUID against the live list of enabled instances. If
  // the user disables or deletes the previously-selected instance the filter
  // silently falls back to "all" rather than producing an empty calendar.
  const sonarrInstances = useMemo(
    () =>
      sonarrFilter === ALL
        ? sonarrAll
        : sonarrAll.filter((i) => i.id === sonarrFilter),
    [sonarrAll, sonarrFilter],
  );
  const radarrInstances = useMemo(
    () =>
      radarrFilter === ALL
        ? radarrAll
        : radarrAll.filter((i) => i.id === radarrFilter),
    [radarrAll, radarrFilter],
  );

  const { start, end } = getFetchRange(year, month);

  // Fan out the calendar query across every selected Sonarr/Radarr instance.
  // Each instance contributes its own slice of dates; we flatten and dedupe
  // visually (no need to merge by id — different instances have different
  // libraries, so duplicate ids across instances are still distinct shows).
  const sonarrQueries = useQueries({
    queries: sonarrInstances.map((inst) => ({
      queryKey: [
        "sonarr",
        inst.id,
        "calendar",
        start,
        end,
        includeUnmonitored,
      ] as const,
      queryFn: () =>
        getSonarrCalendar(start, end, { unmonitored: includeUnmonitored }, inst.id),
      refetchInterval: POLLING_INTERVALS.calendar,
    })),
  });

  const radarrQueries = useQueries({
    queries: radarrInstances.map((inst) => ({
      queryKey: [
        "radarr",
        inst.id,
        "calendar",
        start,
        end,
        includeUnmonitored,
      ] as const,
      queryFn: () =>
        getRadarrCalendar(start, end, { unmonitored: includeUnmonitored }, inst.id),
      refetchInterval: POLLING_INTERVALS.calendar,
    })),
  });

  // Per-instance download queues, so an episode/movie currently grabbing reads
  // purple in the day list — same indicator as the poster grid and the detail
  // screens (issue #207). Reuses the shared ["sonarr"/"radarr", id, "queue"]
  // cache key, so this rides whatever the rest of the app already polls.
  const sonarrQueueQueries = useQueries({
    queries: sonarrInstances.map((inst) => ({
      queryKey: ["sonarr", inst.id, "queue"] as const,
      queryFn: () => getSonarrQueue(1, 20, true, true, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });
  const radarrQueueQueries = useQueries({
    queries: radarrInstances.map((inst) => ({
      queryKey: ["radarr", inst.id, "queue"] as const,
      queryFn: () => getRadarrQueue(1, 20, true, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  // Keyed by `instanceId:episodeId` / `instanceId:movieId` because ids aren't
  // globally unique across instances.
  const downloadingKeys = useMemo(() => {
    const keys = new Set<string>();
    sonarrQueueQueries.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      (q.data?.records ?? []).forEach((r) =>
        keys.add(`${instanceId}:${r.episodeId}`),
      );
    });
    radarrQueueQueries.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      (q.data?.records ?? []).forEach((r) =>
        keys.add(`${instanceId}:${r.movieId}`),
      );
    });
    return keys;
  }, [sonarrQueueQueries, radarrQueueQueries, sonarrInstances, radarrInstances]);

  // Tag each calendar entry with the source instance so navigation can route
  // detail-screen queries to the correct Sonarr/Radarr (ids aren't globally
  // unique across instances).
  const taggedEpisodes = sonarrQueries.flatMap((q, i) =>
    (q.data ?? []).map((data) => ({
      data,
      instanceId: sonarrInstances[i]?.id,
    })),
  );
  const taggedMovies = radarrQueries.flatMap((q, i) =>
    (q.data ?? []).map((data) => ({
      data,
      instanceId: radarrInstances[i]?.id,
    })),
  );
  const loadingEp = sonarrQueries.length > 0 && sonarrQueries.some((q) => q.isLoading);
  const loadingMov = radarrQueries.length > 0 && radarrQueries.some((q) => q.isLoading);

  // Partial-failure surfacing: collect every failing instance (not just the
  // first) so multi-instance setups know exactly which server is down. We
  // don't replace the page on these — Sonarr can fail while Radarr still
  // shows movies (and vice-versa). Banners appear above the calendar grid
  // so users know *why* an expected service is missing, without losing the
  // working one.
  const failingSonarr = sonarrQueries.flatMap((q, i) => {
    const inst = sonarrInstances[i];
    return q.error && inst ? [{ error: q.error, instance: inst }] : [];
  });
  const failingRadarr = radarrQueries.flatMap((q, i) => {
    const inst = radarrInstances[i];
    return q.error && inst ? [{ error: q.error, instance: inst }] : [];
  });
  const multiSonarr = sonarrInstances.length > 1;
  const multiRadarr = radarrInstances.length > 1;

  // Pull-to-refresh invalidates every per-instance calendar slot. Building
  // these key lists from the live instance arrays guarantees we don't miss
  // (or stale-refresh) an instance the user just added or disabled.
  const refreshKeys = useMemo<unknown[][]>(
    () => [
      ...sonarrInstances.map((inst) => [
        "sonarr",
        inst.id,
        "calendar",
        start,
        end,
        includeUnmonitored,
      ]),
      ...radarrInstances.map((inst) => [
        "radarr",
        inst.id,
        "calendar",
        start,
        end,
        includeUnmonitored,
      ]),
    ],
    [sonarrInstances, radarrInstances, start, end, includeUnmonitored],
  );
  const { refreshing, onRefresh } = usePullToRefresh(refreshKeys);

  // Build items map keyed by date
  const { itemsByDate, allItems } = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const all: CalendarItem[] = [];

    if (filter !== "movies") {
      for (const { data: ep, instanceId } of taggedEpisodes) {
        if (!instanceId) continue;
        const key = airDateKey(ep);
        if (!key) continue;
        const item: CalendarItem = {
          type: "episode",
          date: key,
          data: ep,
          instanceId,
        };
        all.push(item);
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
    }

    if (filter !== "tv") {
      for (const { data: movie, instanceId } of taggedMovies) {
        if (!instanceId) continue;
        const date = getMovieReleaseDate(movie);
        if (date) {
          const item: CalendarItem = {
            type: "movie",
            date,
            data: movie,
            instanceId,
          };
          all.push(item);
          const list = map.get(date) ?? [];
          list.push(item);
          map.set(date, list);
        }
      }
    }

    return { itemsByDate: map, allItems: all };
  }, [taggedEpisodes, taggedMovies, filter]);

  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);
  const todayKey = localDateKey(today);
  const selectedItems = itemsByDate.get(selectedDate) ?? [];

  // Workspace can be configured such that no calendar-able service is
  // attached (e.g. user un-attached both Sonarr and Radarr after pinning the
  // tab). The tab-bar redirect in _layout.tsx normally bounces them away, but
  // they can still land here via a deep-link or the rare race during edit.
  // Render a contextual empty state instead of an empty grid.
  const hasAnyAttached = sonarrAllRaw.length > 0 || radarrAllRaw.length > 0;
  const hasAnyOnDashboard = sonarrAll.length > 0 || radarrAll.length > 0;
  if (!hasAnyOnDashboard) {
    return (
      <ScreenWrapper scrollable={false}>
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Text className="text-zinc-100 text-lg font-semibold">
            {hasAnyAttached ? "Nothing attached here" : "No calendar source enabled"}
          </Text>
          <Text className="text-zinc-500 text-sm text-center">
            {hasAnyAttached
              ? "Open the dashboard switcher and attach Sonarr or Radarr to this workspace."
              : "Enable Sonarr or Radarr in Settings to populate the calendar."}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  function goMonth(delta: number) {
    lightHaptic();
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function goToday() {
    lightHaptic();
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(localDateKey(now));
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {/* Month header. The month label uses `flex-1` (not a fixed min-width)
          so chevrons + label + Today pill stay on-screen at every uiScale.
          The previous `min-w-[12rem]` was hard-coded for scale 1.0 and pushed
          Today off the right edge at 1.3 — see #99. `numberOfLines={1}` keeps
          the label on a single line if it ever still runs out of room. */}
      <View className="flex-row items-center mb-3 gap-1">
        <Pressable onPress={() => goMonth(-1)} className="p-2 active:opacity-70">
          <Icon icon={ChevronLeft} size={ICON.LG} color="#a1a1aa" />
        </Pressable>
        <Text
          className="text-zinc-100 text-lg font-bold flex-1 text-center"
          numberOfLines={1}
        >
          {MONTH_NAMES[month]} {year}
        </Text>
        <Pressable onPress={() => goMonth(1)} className="p-2 active:opacity-70">
          <Icon icon={ChevronRight} size={ICON.LG} color="#a1a1aa" />
        </Pressable>
        <Pressable
          onPress={goToday}
          className="px-3 py-1.5 rounded-lg bg-primary/20 active:opacity-70"
        >
          <Text className="text-primary text-xs font-semibold">Today</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-3"
      >
        {(["all", "tv", "movies"] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={f === "tv" ? "TV" : f.charAt(0).toUpperCase() + f.slice(1)}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
        <FilterChip
          label="Include unmonitored"
          selected={includeUnmonitored}
          icon={
            <Icon
              icon={includeUnmonitored ? Eye : EyeOff}
              size={14}
              color={includeUnmonitored ? "#fff" : "#a1a1aa"}
            />
          }
          onPress={() => {
            lightHaptic();
            setIncludeUnmonitored(!includeUnmonitored);
          }}
        />
      </ScrollView>

      {/* Per-kind instance scope. Each picker hides itself when there's 0–1
          enabled instance for that kind — single-instance users see nothing
          new. Multi-instance users get an explicit way to exclude an
          unreachable server (e.g. a Tailscale-only secondary while off-VPN)
          so its inevitable failure doesn't surface as an error banner. */}
      {(sonarrAll.length > 1 || radarrAll.length > 1) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="mb-3"
        >
          {sonarrAll.length > 1 ? (
            <InstanceScopePicker
              kind="sonarr"
              instances={sonarrAll}
              value={sonarrFilter}
              onChange={setSonarrFilter}
            />
          ) : null}
          {radarrAll.length > 1 ? (
            <InstanceScopePicker
              kind="radarr"
              instances={radarrAll}
              value={radarrFilter}
              onChange={setRadarrFilter}
            />
          ) : null}
        </ScrollView>
      )}

      {/* Per-service errors (partial failure — keep showing the working side).
          Instance name is suffixed only when multiple instances are configured
          for that kind, so single-instance users see a clean title. */}
      {failingSonarr.map(({ error, instance }) => (
        <ErrorBanner
          key={`sonarr-${instance.id}`}
          error={error}
          title={
            multiSonarr
              ? `Failed to load Sonarr calendar (${instance.name})`
              : "Failed to load Sonarr calendar"
          }
          className="mb-3"
        />
      ))}
      {failingRadarr.map(({ error, instance }) => (
        <ErrorBanner
          key={`radarr-${instance.id}`}
          error={error}
          title={
            multiRadarr
              ? `Failed to load Radarr calendar (${instance.name})`
              : "Failed to load Radarr calendar"
          }
          className="mb-3"
        />
      ))}

      {/* Calendar grid */}
      <Card>
        {/* Weekday headers */}
        <View className="flex-row">
          {WEEKDAYS.map((d) => (
            <View key={d} className="flex-1 items-center pb-2">
              <Text className="text-zinc-500 text-xs font-medium">{d}</Text>
            </View>
          ))}
        </View>

        {/* Day cells */}
        {chunk(grid, 7).map((week, wi) => (
          <View key={wi} className="flex-row">
            {week.map((cell) => {
              const isSelected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === todayKey;
              const events = itemsByDate.get(cell.dateKey);
              const hasEpisodes = events?.some((e) => e.type === "episode");
              const hasMovies = events?.some((e) => e.type === "movie");

              return (
                <Pressable
                  key={cell.dateKey}
                  onPress={() => {
                    lightHaptic();
                    setSelectedDate(cell.dateKey);
                  }}
                  className="flex-1 items-center py-1.5"
                >
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center ${
                      isSelected
                        ? "bg-primary"
                        : isToday
                          ? "border border-primary"
                          : ""
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "text-white font-bold"
                          : !cell.inMonth
                            ? "text-zinc-700"
                            : isToday
                              ? "text-primary font-semibold"
                              : "text-zinc-300"
                      }`}
                    >
                      {cell.day}
                    </Text>
                  </View>
                  {/* Event dots */}
                  <View className="flex-row gap-0.5 mt-0.5 h-1.5">
                    {hasEpisodes && (
                      <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                    {hasMovies && (
                      <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      {/* Selected day events */}
      <View className="mt-4">
        <Text className="text-zinc-400 text-xs font-semibold mb-2">
          {formatSelectedDate(selectedDate)}
        </Text>

        {(loadingEp || loadingMov) ? (
          <View className="gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={64} borderRadius={16} />
            ))}
          </View>
        ) : selectedItems.length === 0 ? (
          <EmptyState title="Nothing on this day" />
        ) : (
          <SelectedDayList
            items={selectedItems}
            downloadingKeys={downloadingKeys}
          />
        )}
      </View>
    </ScreenWrapper>
  );
}

function SelectedDayList({
  items,
  downloadingKeys,
}: {
  items: CalendarItem[];
  downloadingKeys: Set<string>;
}) {
  const router = useRouter();

  return (
    <View className="gap-2">
      {items.map((item) =>
        item.type === "episode" ? (
          <EpisodeRow
            key={`ep-${item.instanceId}-${item.data.id}`}
            episode={item.data}
            downloading={downloadingKeys.has(`${item.instanceId}:${item.data.id}`)}
            onPress={() =>
              router.push(
                `/series/${item.data.seriesId}?instanceId=${item.instanceId}`,
              )
            }
          />
        ) : (
          <MovieRow
            key={`mov-${item.instanceId}-${item.data.id}`}
            movie={item.data}
            downloading={downloadingKeys.has(`${item.instanceId}:${item.data.id}`)}
            onPress={() =>
              router.push(`/movie/${item.data.id}?instanceId=${item.instanceId}`)
            }
          />
        ),
      )}
    </View>
  );
}

function EpisodeRow({
  episode,
  downloading,
  onPress,
}: {
  episode: SonarrCalendarEntry;
  downloading: boolean;
  onPress: () => void;
}) {
  return (
    <CalendarEventRow
      images={episode.series.images}
      service="sonarr"
      title={episode.series.title}
      subtitle={`${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} — ${episode.title}`}
      hasFile={episode.hasFile}
      downloading={downloading}
      barColor={BAR_KIND_COLOR[sonarrEpisodeBarKind(episode, downloading)]}
      onPress={onPress}
    />
  );
}

function MovieRow({
  movie,
  downloading,
  onPress,
}: {
  movie: RadarrMovie;
  downloading: boolean;
  onPress: () => void;
}) {
  return (
    <CalendarEventRow
      images={movie.images}
      service="radarr"
      title={movie.title}
      subtitle={`${movie.year} — ${getMovieReleaseType(movie)}`}
      hasFile={movie.hasFile}
      downloading={downloading}
      barColor={BAR_KIND_COLOR[radarrBarKind(movie, downloading)]}
      onPress={onPress}
    />
  );
}

function InstanceScopePicker({
  kind,
  instances,
  value,
  onChange,
}: {
  kind: ServiceId;
  instances: ServiceInstance[];
  value: InstanceFilter;
  onChange: (next: InstanceFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const kindLabel = SERVICE_DEFAULTS[kind].name;
  const activeLabel =
    value === ALL
      ? "All"
      : (instances.find((i) => i.id === value)?.name ?? "All");

  const actions: ActionSheetAction[] = [
    {
      label: "All instances",
      icon: (
        <Icon
          icon={value === ALL ? Check : Server}
          size={18}
          color={value === ALL ? "#22c55e" : "#a1a1aa"}
        />
      ),
      onPress: () => onChange(ALL),
    },
    ...instances.map((inst) => ({
      label: inst.name,
      icon: (
        <Icon
          icon={inst.id === value ? Check : Server}
          size={18}
          color={inst.id === value ? "#22c55e" : "#a1a1aa"}
        />
      ),
      onPress: () => onChange(inst.id),
    })),
  ];

  return (
    <>
      <Pressable
        onPress={() => {
          lightHaptic();
          setOpen(true);
        }}
        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border active:opacity-70"
      >
        <Text className="text-zinc-400 text-xs">{kindLabel}:</Text>
        <Text className="text-zinc-100 text-xs font-medium" numberOfLines={1}>
          {activeLabel}
        </Text>
        <Icon icon={ChevronDown} size={12} color="#71717a" />
      </Pressable>
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={`${kindLabel} instances`}
        actions={actions}
      />
    </>
  );
}

// --- Helpers ---

function getMovieReleaseDate(movie: RadarrMovie): string | null {
  return releaseDateKey(
    movie.digitalRelease ?? movie.physicalRelease ?? movie.inCinemas,
  );
}

function getMovieReleaseType(movie: RadarrMovie): string {
  if (movie.digitalRelease) return "Digital Release";
  if (movie.physicalRelease) return "Physical Release";
  if (movie.inCinemas) return "In Cinemas";
  return "Release";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function formatSelectedDate(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
