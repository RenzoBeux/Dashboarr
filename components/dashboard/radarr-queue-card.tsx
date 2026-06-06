import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getQueue,
  getWantedMissing,
  getRadarrPoster,
} from "@/services/radarr-api";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  RADARR_QUEUE_DEFAULT_SETTINGS,
  type RadarrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/radarr-queue-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

export function RadarrQueueCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<RadarrQueueSettingsValue>(
    slotId,
    RADARR_QUEUE_DEFAULT_SETTINGS,
  );
  // Aggregate queue + wanted counts across every enabled Radarr instance, or
  // narrow to the bound subset based on the slot's instance binding.
  const instances = useWorkspaceScopedInstances("radarr", settings.instanceIds);

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

  // Initial-load gate only on the queue queries — see lib/multi-instance-query.ts.
  // Wanted counts are summed; a single failing instance just contributes 0 and
  // the rest of the badge stays accurate.
  const { isInitialLoading } = aggregateMultiInstanceState(queueQueries);
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
  const display = records.slice(0, settings.maxItems);
  const hasMore = records.length > settings.maxItems;

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
        <EmptyState compact title="No Radarr instances enabled" />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : records.length === 0 ? (
        <EmptyState compact title="No movies in queue" />
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
                  // Movie ids aren't globally unique across instances, so we
                  // pass the source instance id to the detail screen — it
                  // queries Radarr against that instance instead of the
                  // user's currently-active one.
                  item.movie &&
                  router.push(
                    `/movie/${item.movie.id}?instanceId=${instanceId}`,
                  )
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
