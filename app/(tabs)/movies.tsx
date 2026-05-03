import { useState, useMemo } from "react";
import { View, Text, Pressable, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Search, Film, Eye, EyeOff, Trash2, Info } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";

import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
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
import { formatBytes } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import { mediumHaptic } from "@/lib/haptics";
import type { RadarrMovie, RadarrQueueItem } from "@/lib/types";

type MovieSheetTarget =
  | { kind: "movie"; item: RadarrMovie }
  | { kind: "queue"; item: RadarrQueueItem }
  | null;

type Tab = "library" | "queue" | "wanted";
type MonitorFilter = "monitored" | "unmonitored" | "all";

const MONITOR_FILTERS: { value: MonitorFilter; label: string }[] = [
  { value: "monitored", label: "Monitored" },
  { value: "unmonitored", label: "Unmonitored" },
  { value: "all", label: "All" },
];

export default function MoviesScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
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
        icon: <Search size={18} color="#a1a1aa" />,
        onPress: () => searchMutation.mutate(movie.id),
      },
      {
        label: movie.monitored ? "Unmonitor" : "Monitor",
        icon: movie.monitored ? (
          <EyeOff size={18} color="#a1a1aa" />
        ) : (
          <Eye size={18} color="#a1a1aa" />
        ),
        onPress: () =>
          toggleMonitor.mutate({ movieId: movie.id, monitored: !movie.monitored }),
      },
      {
        label: "Open Details",
        icon: <Info size={18} color="#a1a1aa" />,
        onPress: () => router.push(`/movie/${movie.id}`),
      },
      {
        label: "Delete",
        icon: <Trash2 size={18} color="#ef4444" />,
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
        <ServiceHeader name="Movies" online={radarrHealth?.online} />
        <Pressable
          onPress={() => router.push("/movie/search")}
          className="p-2 active:opacity-70"
        >
          <Search size={ICON.LG} color="#a1a1aa" />
        </Pressable>
      </View>

      <View className="flex-row gap-2 mb-4">
        {(["library", "queue", "wanted"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      {tab === "library" && (
        <View className="flex-row gap-2 mb-4">
          {MONITOR_FILTERS.map((f) => (
            <FilterChip
              key={f.value}
              label={f.label}
              selected={monitorFilter === f.value}
              onPress={() => setMonitorFilter(f.value)}
            />
          ))}
        </View>
      )}

      {tab === "library" && (
        <MovieLibrary monitorFilter={monitorFilter} onLongPress={openMovieSheet} />
      )}
      {tab === "queue" && <MovieQueue onLongPress={openQueueSheet} />}
      {tab === "wanted" && <MovieWanted />}

      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
        title={sheetMovie?.title}
        subtitle={sheetMovie ? String(sheetMovie.year) : undefined}
        actions={actions}
      />
    </ScreenWrapper>
  );
}

function MovieLibrary({
  monitorFilter,
  onLongPress,
}: {
  monitorFilter: MonitorFilter;
  onLongPress: (movie: RadarrMovie) => void;
}) {
  const { data: movies, isLoading } = useRadarrMovies();
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} className="w-[30%]">
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    );
  }
  if (!movies?.length) {
    return <EmptyState icon={<Film size={32} color="#71717a" />} title="No movies in library" />;
  }

  const filtered = movies.filter((m) => {
    if (monitorFilter === "monitored") return m.monitored;
    if (monitorFilter === "unmonitored") return !m.monitored;
    return true;
  });

  if (!filtered.length) {
    const title =
      monitorFilter === "monitored"
        ? "No monitored movies"
        : monitorFilter === "unmonitored"
          ? "No unmonitored movies"
          : "No movies in library";
    return <EmptyState icon={<Film size={32} color="#71717a" />} title={title} />;
  }

  // Sort by recently added
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.added).getTime() - new Date(a.added).getTime(),
  );

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((movie) => (
        <MoviePoster
          key={movie.id}
          movie={movie}
          onPress={() => router.push(`/movie/${movie.id}`)}
          onLongPress={() => onLongPress(movie)}
        />
      ))}
    </View>
  );
}

function MoviePoster({
  movie,
  onPress,
  onLongPress,
}: {
  movie: RadarrMovie;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const poster = movie.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "radarr");

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      className="w-[30%] active:opacity-80"
    >
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          resizeMode="cover"
          onError={onError}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Film size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-xs mt-1" numberOfLines={1}>
        {movie.title}
      </Text>
      <Text className="text-zinc-600 text-[10px]">{movie.year}</Text>
    </Pressable>
  );
}

function MovieQueue({ onLongPress }: { onLongPress: (item: RadarrQueueItem) => void }) {
  const { data: queue, isLoading } = useRadarrQueue();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={3} />;
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
  const router = useRouter();

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
