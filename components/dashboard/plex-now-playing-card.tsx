import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessions } from "@/services/plex-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  type PlexNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/plex-now-playing-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import { NowPlayingStreamTile } from "@/components/dashboard/now-playing-stream-tile";
import { parseHiddenUsers, plexSessionToStream } from "@/lib/now-playing-stream";

export function PlexNowPlayingCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<PlexNowPlayingSettingsValue>(
    slotId,
    PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("plex", settings.instanceIds);
  const router = useRouter();

  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["plex", inst.id, "sessions"] as const,
      queryFn: () => getSessions(inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });
  // Initial-load gate only — see lib/multi-instance-query.ts. Once any Plex
  // returns sessions we keep rendering them across refetches even if a sibling
  // instance is currently failing.
  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  // Tag every session with its source instance so per-tile poster URLs hit the
  // right Plex (thumb paths are token-scoped), then normalize to a stream.
  const allStreams = queries.flatMap((q, i) =>
    (q.data ?? []).map((s) => plexSessionToStream(s, instances[i].id)),
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

  return (
    <Card>
      <CardHeaderLink
        title="Plex"
        onPress={() => router.push("/(tabs)/plex")}
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
        <EmptyState compact title="No Plex instances enabled" />
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
            <ViewAllTile onPress={() => router.push("/(tabs)/plex")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
