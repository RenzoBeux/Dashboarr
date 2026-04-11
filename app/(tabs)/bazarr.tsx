import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Captions, Search as SearchIcon, Film, Tv } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  useBazarrWantedMovies,
  useBazarrWantedEpisodes,
  useBazarrMovieHistory,
  useBazarrEpisodeHistory,
  useSearchWantedMovie,
  useSearchWantedEpisode,
} from "@/hooks/use-bazarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { truncateText } from "@/lib/utils";

type Tab = "movies" | "episodes" | "history";

export default function BazarrScreen() {
  const [tab, setTab] = useState<Tab>("movies");
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["bazarr"]]);

  const bazarrHealth = healthData?.find((s) => s.id === "bazarr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Bazarr" online={bazarrHealth?.online} />

      <View className="flex-row gap-2 mb-4">
        <FilterChip
          label="Movies"
          selected={tab === "movies"}
          onPress={() => setTab("movies")}
        />
        <FilterChip
          label="Episodes"
          selected={tab === "episodes"}
          onPress={() => setTab("episodes")}
        />
        <FilterChip
          label="History"
          selected={tab === "history"}
          onPress={() => setTab("history")}
        />
      </View>

      {tab === "movies" && <WantedMovies />}
      {tab === "episodes" && <WantedEpisodes />}
      {tab === "history" && <History />}
    </ScreenWrapper>
  );
}

function WantedMovies() {
  const { data, isLoading } = useBazarrWantedMovies();
  const searchMovie = useSearchWantedMovie();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (!data?.data?.length) {
    return (
      <EmptyState
        icon={<Film size={32} color="#71717a" />}
        title="No missing movie subtitles"
      />
    );
  }

  const handleSearch = (radarrId: number, title: string) => {
    searchMovie.mutate(radarrId, {
      onSuccess: () => toast(`Searching for "${title}" subtitles`, "success"),
      onError: () => toast("Failed to start search", "error"),
    });
  };

  return (
    <View className="gap-2">
      {data.data.map((movie) => (
        <Card key={movie.radarrId}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
                {movie.title}
              </Text>
              {movie.sceneName && (
                <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                  {truncateText(movie.sceneName, 50)}
                </Text>
              )}
              <View className="flex-row flex-wrap gap-1.5 mt-2">
                {movie.missing_subtitles?.map((sub, idx) => (
                  <Badge
                    key={`${sub.code2}-${idx}`}
                    label={`${sub.name}${sub.hi ? " HI" : ""}${sub.forced ? " F" : ""}`}
                    variant="wanted"
                  />
                ))}
              </View>
            </View>
            <Pressable
              onPress={() => handleSearch(movie.radarrId, movie.title)}
              className="p-2 active:opacity-70"
              hitSlop={6}
            >
              <SearchIcon size={18} color="#3b82f6" />
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
}

function WantedEpisodes() {
  const { data, isLoading } = useBazarrWantedEpisodes();
  const searchEpisode = useSearchWantedEpisode();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (!data?.data?.length) {
    return (
      <EmptyState
        icon={<Tv size={32} color="#71717a" />}
        title="No missing episode subtitles"
      />
    );
  }

  const handleSearch = (
    seriesId: number,
    episodeId: number,
    title: string,
  ) => {
    searchEpisode.mutate(
      { seriesId, episodeId },
      {
        onSuccess: () => toast(`Searching for "${title}" subtitles`, "success"),
        onError: () => toast("Failed to start search", "error"),
      },
    );
  };

  return (
    <View className="gap-2">
      {data.data.map((episode) => (
        <Card key={episode.sonarrEpisodeId}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
                {episode.seriesTitle}
              </Text>
              <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1}>
                {episode.episode_number} · {episode.episodeTitle}
              </Text>
              <View className="flex-row flex-wrap gap-1.5 mt-2">
                {episode.missing_subtitles?.map((sub, idx) => (
                  <Badge
                    key={`${sub.code2}-${idx}`}
                    label={`${sub.name}${sub.hi ? " HI" : ""}${sub.forced ? " F" : ""}`}
                    variant="wanted"
                  />
                ))}
              </View>
            </View>
            <Pressable
              onPress={() =>
                handleSearch(
                  episode.sonarrSeriesId,
                  episode.sonarrEpisodeId,
                  episode.episodeTitle,
                )
              }
              className="p-2 active:opacity-70"
              hitSlop={6}
            >
              <SearchIcon size={18} color="#3b82f6" />
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
}

function History() {
  const { data: movieHistory, isLoading: moviesLoading } =
    useBazarrMovieHistory();
  const { data: episodeHistory, isLoading: episodesLoading } =
    useBazarrEpisodeHistory();

  const isLoading = moviesLoading || episodesLoading;

  if (isLoading) return <SkeletonCardContent rows={4} />;

  const combined = [
    ...(movieHistory?.data?.map((item) => ({ ...item, _kind: "movie" as const })) ?? []),
    ...(episodeHistory?.data?.map((item) => ({ ...item, _kind: "episode" as const })) ?? []),
  ].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  if (!combined.length) {
    return (
      <EmptyState
        icon={<Captions size={32} color="#71717a" />}
        title="No subtitle history"
      />
    );
  }

  return (
    <View className="gap-2">
      {combined.slice(0, 50).map((item) => {
        const displayTitle =
          item._kind === "movie"
            ? item.title
            : `${item.seriesTitle ?? ""} · ${item.episodeTitle ?? ""}`;
        return (
          <Card key={`${item._kind}-${item.id}`}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                  {displayTitle}
                </Text>
                {item.description && (
                  <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                  {item.language?.name && (
                    <Badge label={item.language.name} variant="info" />
                  )}
                  {item.provider && (
                    <Badge label={item.provider} variant="default" />
                  )}
                </View>
              </View>
              {item._kind === "movie" ? (
                <Film size={16} color="#71717a" />
              ) : (
                <Tv size={16} color="#71717a" />
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
