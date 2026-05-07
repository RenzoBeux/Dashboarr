import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Film } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getQueue,
  getWantedMissing,
  getRadarrPoster,
} from "@/services/radarr-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

const MAX_ITEMS = 5;

export function RadarrQueueCard() {
  const router = useRouter();
  // Aggregate queue + wanted counts across every enabled Radarr instance.
  // Each instance's data is cached under its own UUID-keyed query slot.
  const instances = useEnabledInstances("radarr");

  const queueQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["radarr", inst.id, "queue"] as const,
      queryFn: () => getQueue(1, 20, true, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const wantedQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["radarr", inst.id, "wanted"] as const,
      queryFn: () => getWantedMissing(1, 1, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const isLoading = queueQueries.length > 0 && queueQueries.some((q) => q.isLoading);
  // Tag every queue record with its source instance so the per-tile router
  // push uses the right Radarr's movie id space (Radarr ids aren't unique
  // across instances).
  const records = queueQueries.flatMap((q, i) =>
    (q.data?.records ?? []).map((r) => ({ record: r, instanceId: instances[i].id })),
  );
  const missingCount = wantedQueries.reduce(
    (acc, q) => acc + (q.data?.totalRecords ?? 0),
    0,
  );
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

      {instances.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Film} size={32} color="#71717a" />}
          title="No Radarr instances enabled"
        />
      ) : isLoading ? (
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
          {display.map(({ record: item, instanceId }) => {
            const progress =
              item.size > 0 ? (item.size - item.sizeleft) / item.size : 0;
            const posterUrl = getRadarrPoster(item.movie?.images);
            const movieTitle = item.movie?.title || item.title;

            return (
              <MediaPosterTile
                key={`${instanceId}:${item.id}`}
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
                  // Movie ids aren't globally unique. The router push only
                  // makes sense if the user is currently viewing the same
                  // Radarr instance the queue item belongs to. Tap → switch
                  // active instance to match, then navigate.
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
