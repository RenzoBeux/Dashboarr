import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Captions } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useBazarrWantedMovies,
  useBazarrWantedEpisodes,
} from "@/hooks/use-bazarr";
import { useBazarrPosters } from "@/hooks/use-bazarr-posters";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

interface PreviewItem {
  key: string;
  title: string;
  subtitle: string;
  languages: string;
  mediaType: "movie" | "tv";
}

const MAX_PREVIEW = 5;

export function BazarrWantedCard() {
  const { data: movies, isLoading: moviesLoading } = useBazarrWantedMovies();
  const { data: episodes, isLoading: episodesLoading } = useBazarrWantedEpisodes();
  const router = useRouter();

  const isLoading = moviesLoading || episodesLoading;
  const totalMissing = (movies?.total ?? 0) + (episodes?.total ?? 0);

  const movieList = movies?.data?.slice(0, 3) ?? [];
  const episodeList = episodes?.data?.slice(0, 3) ?? [];
  const posterMap = useBazarrPosters(movieList, episodeList);

  const previewItems: PreviewItem[] = [];
  for (const movie of movieList) {
    previewItems.push({
      key: `movie-${movie.radarrId}`,
      title: movie.title,
      subtitle: "Movie",
      languages:
        movie.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
      mediaType: "movie",
    });
  }
  for (const episode of episodeList) {
    previewItems.push({
      key: `episode-${episode.sonarrEpisodeId}`,
      title: episode.seriesTitle,
      subtitle: `${episode.episode_number} — ${episode.episodeTitle}`,
      languages:
        episode.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
      mediaType: "tv",
    });
  }

  const display = previewItems.slice(0, MAX_PREVIEW);
  const hasMore = totalMissing > display.length;

  return (
    <Card>
      <CardHeaderLink
        title="Bazarr Subtitles"
        onPress={() => router.push("/(tabs)/bazarr")}
        trailing={
          totalMissing > 0 ? (
            <Badge label="Missing" variant="missing" count={totalMissing} />
          ) : null
        }
      />

      {isLoading ? (
        <PosterSkeletonRow count={3} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<Captions size={32} color="#71717a" />}
          title="All subtitles in place"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((item) => {
            const entry = posterMap.get(item.key);
            return (
              <MediaPosterTile
                key={item.key}
                posterUrl={entry?.posterUrl ?? null}
                title={entry?.title ?? item.title}
                subtitle={item.subtitle}
                cornerBadge={{
                  icon: Captions,
                  color: "rgba(168, 85, 247, 0.9)",
                }}
                bottomOverlay={
                  <View className="bg-black/60 px-1.5 py-0.5">
                    <Text
                      className="text-white text-[10px] font-semibold"
                      numberOfLines={1}
                    >
                      {item.languages}
                    </Text>
                  </View>
                }
                mediaType={item.mediaType}
                onPress={() => router.push("/(tabs)/bazarr")}
              />
            );
          })}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/bazarr")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
