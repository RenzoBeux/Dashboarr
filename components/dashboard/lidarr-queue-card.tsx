import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Disc3 } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getQueue, getWantedMissing, getLidarrAlbumCover } from "@/services/lidarr-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  LIDARR_QUEUE_DEFAULT_SETTINGS,
  type LidarrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/lidarr-queue-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

export function LidarrQueueCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<LidarrQueueSettingsValue>(
    slotId,
    LIDARR_QUEUE_DEFAULT_SETTINGS,
  );
  // Aggregate queue + wanted counts across every enabled Lidarr instance, or
  // narrow to the bound subset based on the slot's instance binding.
  const allInstances = useEnabledInstances("lidarr");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);

  const queueQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["lidarr", inst.id, "queue"] as const,
      queryFn: () => getQueue(1, 20, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const wantedQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["lidarr", inst.id, "wanted"] as const,
      queryFn: () => getWantedMissing(1, 1, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  // Initial-load gate only on the queue queries — see lib/multi-instance-query.ts.
  const { isInitialLoading } = aggregateMultiInstanceState(queueQueries);
  // Tag every queue record with its source instance so the per-tile router push
  // uses the right Lidarr's album id space (ids aren't unique across instances).
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
        title="Lidarr Queue"
        onPress={() => router.push("/(tabs)/music")}
        trailing={
          missingCount > 0 ? (
            <Badge label="Missing" variant="missing" count={missingCount} />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title="No Lidarr instances enabled" />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : records.length === 0 ? (
        <EmptyState compact title="No albums in queue" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map(({ record: item, instanceId }) => {
            const progress =
              item.size > 0 ? (item.size - item.sizeleft) / item.size : 0;
            const posterUrl = getLidarrAlbumCover(item.album?.images);
            const albumTitle = item.album?.title || item.title;

            return (
              <MediaPosterTile
                key={`${instanceId}:${item.id}`}
                posterUrl={posterUrl}
                title={albumTitle}
                subtitle={
                  item.artist?.artistName ??
                  (item.timeleft ? `ETA ${item.timeleft}` : undefined)
                }
                fallbackIcon={Disc3}
                cornerBadge={{
                  label: item.quality.quality.name,
                  color: "rgba(168, 85, 247, 0.9)",
                }}
                bottomOverlay={<PosterProgressStrip progress={progress} />}
                onPress={() =>
                  item.albumId &&
                  router.push(`/album/${item.albumId}?instanceId=${instanceId}`)
                }
              />
            );
          })}
          {hasMore && <ViewAllTile onPress={() => router.push("/(tabs)/music")} />}
        </ScrollView>
      )}
    </Card>
  );
}
