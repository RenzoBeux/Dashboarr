import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Captions } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import {
  useBazarrWantedMovies,
  useBazarrWantedEpisodes,
} from "@/hooks/use-bazarr";
import { truncateText } from "@/lib/utils";

export function BazarrWantedCard() {
  const { data: movies, isLoading: moviesLoading } = useBazarrWantedMovies();
  const { data: episodes, isLoading: episodesLoading } = useBazarrWantedEpisodes();
  const router = useRouter();

  const isLoading = moviesLoading || episodesLoading;
  const totalMissing = (movies?.total ?? 0) + (episodes?.total ?? 0);

  // Combine first few items from both lists for preview
  const previewItems: {
    key: string;
    title: string;
    subtitle: string;
    languages: string;
  }[] = [];

  for (const movie of movies?.data?.slice(0, 3) ?? []) {
    previewItems.push({
      key: `movie-${movie.radarrId}`,
      title: movie.title,
      subtitle: "Movie",
      languages:
        movie.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
    });
  }

  for (const episode of episodes?.data?.slice(0, 3) ?? []) {
    previewItems.push({
      key: `episode-${episode.sonarrEpisodeId}`,
      title: `${episode.seriesTitle} ${episode.episode_number}`,
      subtitle: episode.episodeTitle,
      languages:
        episode.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
    });
  }

  return (
    <Pressable onPress={() => router.push("/(tabs)/bazarr")}>
      <Card>
        <CardHeader>
          <CardTitle>Bazarr Subtitles</CardTitle>
          {totalMissing > 0 && (
            <Badge label="Missing" variant="missing" count={totalMissing} />
          )}
        </CardHeader>

        {isLoading ? (
          <SkeletonCardContent rows={3} />
        ) : previewItems.length === 0 ? (
          <EmptyState
            icon={<Captions size={32} color="#71717a" />}
            title="All subtitles in place"
          />
        ) : (
          <View className="gap-2">
            {previewItems.slice(0, 5).map((item) => (
              <View key={item.key} className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                    {truncateText(item.title, 35)}
                  </Text>
                  <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <Badge label={item.languages} variant="wanted" />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Pressable>
  );
}
