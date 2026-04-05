import { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { Search, Film } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";

import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import { useRadarrMovies, useRadarrQueue, useWantedMissing } from "@/hooks/use-radarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatBytes } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import type { RadarrMovie } from "@/lib/types";

type Tab = "library" | "queue" | "wanted";

export default function MoviesScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["radarr"]]);

  const radarrHealth = healthData?.find((s) => s.id === "radarr");

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

      {tab === "library" && <MovieLibrary />}
      {tab === "queue" && <MovieQueue />}
      {tab === "wanted" && <MovieWanted />}
    </ScreenWrapper>
  );
}

function MovieLibrary() {
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

  // Sort by recently added
  const sorted = [...movies].sort(
    (a, b) => new Date(b.added).getTime() - new Date(a.added).getTime(),
  );

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((movie) => (
        <MoviePoster
          key={movie.id}
          movie={movie}
          onPress={() => router.push(`/movie/${movie.id}`)}
        />
      ))}
    </View>
  );
}

function MoviePoster({ movie, onPress }: { movie: RadarrMovie; onPress: () => void }) {
  const poster = movie.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "radarr");

  return (
    <Pressable onPress={onPress} className="w-[30%] active:opacity-80">
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

function MovieQueue() {
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
