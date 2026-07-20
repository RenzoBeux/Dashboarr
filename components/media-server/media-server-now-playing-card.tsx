import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessions } from "@/services/jellyfin-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { MediaServerId } from "@/lib/media-server-config";
import {
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  type StreamingNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/streaming-now-playing-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import { NowPlayingStreamTile } from "@/components/dashboard/now-playing-stream-tile";
import { mediaServerSessionToStream, parseHiddenUsers } from "@/lib/now-playing-stream";

// Shared now-playing dashboard card for Jellyfin and Emby — identical session
// data, parameterized by serviceId. See lib/media-server-config.ts.
export function MediaServerNowPlayingCard({
  slotId,
  serviceId,
  displayName,
}: WidgetComponentProps & { serviceId: MediaServerId; displayName: string }) {
  const { settings } = useWidgetSettings<StreamingNowPlayingSettingsValue>(
    slotId,
    STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances(serviceId, settings.instanceIds);
  const router = useRouter();

  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: [serviceId, inst.id, "sessions"] as const,
      queryFn: () => getSessions(inst.id, serviceId),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });
  // Initial-load gate only — once any instance returns sessions, render them
  // even if a sibling instance is currently failing its retry loop. Prevents
  // the "one offline server flickers the card every 5s" problem.
  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  const allStreams = queries.flatMap((q, i) =>
    (q.data ?? []).map((s) => mediaServerSessionToStream(s, instances[i].id, serviceId)),
  );

  const hiddenUsers = parseHiddenUsers(settings.hideUsers);
  const filtered = allStreams.filter((stream) => {
    if (settings.hideLocalPlays && stream.isLocal) return false;
    if (hiddenUsers.size > 0 && stream.user && hiddenUsers.has(stream.user.toLowerCase())) {
      return false;
    }
    return true;
  });

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || display.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card>
      <CardHeaderLink
        title={displayName}
        onPress={() => router.push(`/(tabs)/${serviceId}`)}
        trailing={
          filtered.length > 0 ? (
            <Badge
              label={`${filtered.length} stream${filtered.length !== 1 ? "s" : ""}`}
              variant="success"
            />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title={`No ${displayName} instances enabled`} />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={2} />
      ) : display.length === 0 ? (
        <EmptyState compact title="Nothing playing" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((stream) => (
            <NowPlayingStreamTile
              key={stream.key}
              stream={stream}
              showUserAndDevice={settings.showUserAndDevice}
              showTranscoding={settings.showTranscoding}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push(`/(tabs)/${serviceId}`)} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
