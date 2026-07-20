import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  ARR_QUEUE_DEFAULT_SETTINGS,
  type ArrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/arr-queue-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import { DOWNLOAD_INDICATOR_COLOR } from "@/lib/arr-poster-status";

interface Props extends WidgetComponentProps {
  adapter: ArrQueueAdapter;
}

// Shared dashboard queue card for the *arr trio (Radarr / Sonarr / Lidarr).
// Aggregates the active queue + missing count across every enabled instance
// of the adapter's service; the adapter normalizes each service's queue
// records into ArrQueueItems so the rendering here stays service-agnostic.
export function ArrQueueCard({ slotId, adapter }: Props) {
  const router = useRouter();
  const { settings } = useWidgetSettings<ArrQueueSettingsValue>(
    slotId,
    ARR_QUEUE_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances(
    adapter.serviceId,
    settings.instanceIds,
  );

  const queueQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: adapter.queueQueryKey(inst.id),
      queryFn: () => adapter.fetchQueue(inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const wantedQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: adapter.wantedQueryKey(inst.id),
      queryFn: () => adapter.fetchWanted(inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  // Initial-load gate only on the queue queries — see lib/multi-instance-query.ts.
  // Wanted counts are summed; a single failing instance just contributes 0 and
  // the rest of the badge stays accurate.
  const { isInitialLoading } = aggregateMultiInstanceState(queueQueries);
  // The queries cache the RAW service response (shared with useRadarrQueue etc.);
  // normalize here via the adapter, tagging each row with its source instance so
  // the per-tile push uses the right id space (ids aren't unique across instances).
  const records = queueQueries.flatMap((q, i) => {
    if (!q.data) return [];
    const instanceId = instances[i].id;
    return adapter
      .toItems(q.data, instanceId)
      .map((item) => ({ item, instanceId }));
  });
  const missingCount = wantedQueries.reduce(
    (acc, q) => acc + (q.data ? adapter.wantedCount(q.data) : 0),
    0,
  );
  const display = records.slice(0, settings.maxItems);
  const hasMore = records.length > settings.maxItems;

  // A nonzero Missing badge is real content, so it keeps the card visible.
  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty:
      instances.length === 0 || (records.length === 0 && missingCount === 0),
    isLoading: isInitialLoading,
  });

  return (
    <Card>
      <CardHeaderLink
        title={`${adapter.displayName} Queue`}
        onPress={() => router.push(adapter.listRoute)}
        trailing={
          missingCount > 0 ? (
            <Badge label="Missing" variant="missing" count={missingCount} />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title={`No ${adapter.displayName} instances enabled`} />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : records.length === 0 ? (
        <EmptyState compact title={adapter.emptyQueueLabel} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map(({ item, instanceId }) => (
            <MediaPosterTile
              key={`${instanceId}:${item.id}`}
              posterUrl={item.posterUrl}
              title={item.title}
              subtitle={item.subtitle}
              fallbackIcon={adapter.fallbackIcon}
              mediaType={adapter.mediaType}
              cornerBadge={{
                label: item.qualityLabel,
                color: adapter.badgeColor,
              }}
              bottomOverlay={
                <PosterProgressStrip
                  progress={item.progress}
                  color={DOWNLOAD_INDICATOR_COLOR.downloading}
                />
              }
              onPress={() => item.detailPath && router.push(item.detailPath)}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push(adapter.listRoute)} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
