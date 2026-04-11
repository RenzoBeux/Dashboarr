import { useState, useMemo } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Tv, Film } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ICON, POLLING_INTERVALS } from "@/lib/constants";
import { getCalendar as getSonarrCalendar } from "@/services/sonarr-api";
import { getCalendar as getRadarrCalendar } from "@/services/radarr-api";
import { useConfigStore } from "@/store/config-store";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatEpisodeCode } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import { lightHaptic } from "@/lib/haptics";
import type { SonarrCalendarEntry, RadarrMovie } from "@/lib/types";

type Filter = "all" | "tv" | "movies";

type CalendarItem =
  | { type: "episode"; date: string; data: SonarrCalendarEntry }
  | { type: "movie"; date: string; data: RadarrMovie };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: toDateKey(start),
    end: toDateKey(end),
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
    cells.push({ day: d, dateKey: toDateKey(date), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, dateKey: toDateKey(date), inMonth: true });
  }

  // Next month padding
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      cells.push({ day: d, dateKey: toDateKey(date), inMonth: false });
    }
  }

  return cells;
}

export default function CalendarScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));
  const [filter, setFilter] = useState<Filter>("all");

  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);

  const { start, end } = getMonthRange(year, month);

  const { data: episodes, isLoading: loadingEp } = useQuery({
    queryKey: ["sonarr", "calendar", start, end],
    queryFn: () => getSonarrCalendar(start, end),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: sonarrEnabled,
  });

  const { data: movies, isLoading: loadingMov } = useQuery({
    queryKey: ["radarr", "calendar", start, end],
    queryFn: () => getRadarrCalendar(start, end),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: radarrEnabled,
  });

  const { refreshing, onRefresh } = usePullToRefresh([
    ["sonarr", "calendar", start, end],
    ["radarr", "calendar", start, end],
  ]);

  // Build items map keyed by date
  const { itemsByDate, allItems } = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const all: CalendarItem[] = [];

    if (filter !== "movies") {
      for (const ep of episodes ?? []) {
        const item: CalendarItem = { type: "episode", date: ep.airDate, data: ep };
        all.push(item);
        const list = map.get(ep.airDate) ?? [];
        list.push(item);
        map.set(ep.airDate, list);
      }
    }

    if (filter !== "tv") {
      for (const movie of movies ?? []) {
        const date = getMovieReleaseDate(movie);
        if (date) {
          const item: CalendarItem = { type: "movie", date, data: movie };
          all.push(item);
          const list = map.get(date) ?? [];
          list.push(item);
          map.set(date, list);
        }
      }
    }

    return { itemsByDate: map, allItems: all };
  }, [episodes, movies, filter]);

  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);
  const todayKey = toDateKey(today);
  const selectedItems = itemsByDate.get(selectedDate) ?? [];

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
    setSelectedDate(toDateKey(now));
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {/* Month header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-1">
          <Pressable onPress={() => goMonth(-1)} className="p-2 active:opacity-70">
            <ChevronLeft size={ICON.LG} color="#a1a1aa" />
          </Pressable>
          <Text className="text-zinc-100 text-lg font-bold min-w-[170px] text-center">
            {MONTH_NAMES[month]} {year}
          </Text>
          <Pressable onPress={() => goMonth(1)} className="p-2 active:opacity-70">
            <ChevronRight size={ICON.LG} color="#a1a1aa" />
          </Pressable>
        </View>
        <Pressable
          onPress={goToday}
          className="px-3 py-1.5 rounded-lg bg-primary/20 active:opacity-70"
        >
          <Text className="text-primary text-xs font-semibold">Today</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <View className="flex-row gap-2 mb-3">
        {(["all", "tv", "movies"] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={f === "tv" ? "TV" : f.charAt(0).toUpperCase() + f.slice(1)}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

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
          <SelectedDayList items={selectedItems} />
        )}
      </View>
    </ScreenWrapper>
  );
}

function SelectedDayList({ items }: { items: CalendarItem[] }) {
  const router = useRouter();

  return (
    <View className="gap-2">
      {items.map((item) =>
        item.type === "episode" ? (
          <EpisodeRow
            key={`ep-${item.data.id}`}
            episode={item.data}
            onPress={() => router.push(`/series/${item.data.seriesId}`)}
          />
        ) : (
          <MovieRow
            key={`mov-${item.data.id}`}
            movie={item.data}
            onPress={() => router.push(`/movie/${item.data.id}`)}
          />
        ),
      )}
    </View>
  );
}

function EpisodeRow({
  episode,
  onPress,
}: {
  episode: SonarrCalendarEntry;
  onPress: () => void;
}) {
  const poster = episode.series.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "sonarr");

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-center gap-3">
        {src ? (
          <Image
            source={{ uri: src }}
            className="w-10 h-14 rounded-lg bg-surface-light"
            resizeMode="cover"
            onError={onError}
          />
        ) : (
          <View className="w-10 h-14 rounded-lg bg-surface-light items-center justify-center">
            <Tv size={16} color="#71717a" />
          </View>
        )}
        <View
          className={`w-1 h-10 rounded-full ${
            episode.hasFile ? "bg-success" : "bg-zinc-600"
          }`}
        />
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {episode.series.title}
          </Text>
          <Text className="text-zinc-500 text-xs">
            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} —{" "}
            {episode.title}
          </Text>
        </View>
        <Tv size={14} color="#22c55e" />
      </View>
    </Card>
  );
}

function MovieRow({
  movie,
  onPress,
}: {
  movie: RadarrMovie;
  onPress: () => void;
}) {
  const releaseType = getMovieReleaseType(movie);
  const poster = movie.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "radarr");

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-center gap-3">
        {src ? (
          <Image
            source={{ uri: src }}
            className="w-10 h-14 rounded-lg bg-surface-light"
            resizeMode="cover"
            onError={onError}
          />
        ) : (
          <View className="w-10 h-14 rounded-lg bg-surface-light items-center justify-center">
            <Film size={16} color="#71717a" />
          </View>
        )}
        <View
          className={`w-1 h-10 rounded-full ${
            movie.hasFile ? "bg-success" : "bg-zinc-600"
          }`}
        />
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {movie.title}
          </Text>
          <Text className="text-zinc-500 text-xs">
            {movie.year} — {releaseType}
          </Text>
        </View>
        <Film size={14} color="#f59e0b" />
      </View>
    </Card>
  );
}

// --- Helpers ---

function getMovieReleaseDate(movie: RadarrMovie): string | null {
  const date =
    movie.digitalRelease ?? movie.physicalRelease ?? movie.inCinemas;
  return date ? date.split("T")[0] : null;
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
