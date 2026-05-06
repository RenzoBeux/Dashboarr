import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useRadarrQueue, useWantedMissing } from "@/hooks/use-radarr";
import { getRadarrPoster } from "@/services/radarr-api";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

const MAX_ITEMS = 5;

export function RadarrQueueCard() {
  const { data: queue, isLoading } = useRadarrQueue();
  const { data: wanted } = useWantedMissing();
  const router = useRouter();

  const records = queue?.records ?? [];
  const missingCount = wanted?.totalRecords ?? 0;
  const display = records.slice(0, MAX_ITEMS);
  const hasMore = records.length > MAX_ITEMS;

  return (
    <Card>
      <CardHeaderLink
        title="Radarr Queue"
        onPress={() => router.push("/(tabs)/movies")}
        trailing={
          missingCount > 0 ? (
            <Badge label="Missing" variant="missing" count={missingCount} />
          ) : null
        }
      />

      {isLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Film} size={32} color="#71717a" />}
          title="No movies in queue"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((item) => {
            const progress =
              item.size > 0 ? (item.size - item.sizeleft) / item.size : 0;
            const posterUrl = getRadarrPoster(item.movie?.images);
            const movieTitle = item.movie?.title || item.title;

            return (
              <MediaPosterTile
                key={item.id}
                posterUrl={posterUrl}
                title={movieTitle}
                subtitle={item.timeleft ? `ETA ${item.timeleft}` : undefined}
                cornerBadge={{
                  label: item.quality.quality.name,
                  color: "rgba(37, 99, 235, 0.9)",
                }}
                bottomOverlay={<PosterProgressStrip progress={progress} />}
                mediaType="movie"
                onPress={() =>
                  item.movie && router.push(`/movie/${item.movie.id}`)
                }
              />
            );
          })}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/movies")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
