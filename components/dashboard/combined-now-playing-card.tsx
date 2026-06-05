import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessions as getPlexSessions } from "@/services/plex-api";
import { getSessions as getMediaServerSessions } from "@/services/jellyfin-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import { NowPlayingStreamTile } from "@/components/dashboard/now-playing-stream-tile";
import {
  COMBINED_NOW_PLAYING_DEFAULT_SETTINGS,
  type CombinedNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/combined-now-playing-settings";
import {
  mediaServerSessionToStream,
  parseHiddenUsers,
  plexSessionToStream,
  type NowPlayingStream,
} from "@/lib/now-playing-stream";
import type { JellyfinSession, PlexSession } from "@/lib/types";

// Aggregated "Now Playing" across every enabled Plex + Jellyfin + Emby instance
// in one poster row (issue #115). Reuses the per-server session query keys so a
// dashboard holding both this and a per-service card shares fetches.
export function CombinedNowPlayingCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<CombinedNowPlayingSettingsValue>(
    slotId,
    COMBINED_NOW_PLAYING_DEFAULT_SETTINGS,
  );
  const router = useRouter();

  const plexInstances = useWorkspaceScopedInstances(
    "plex",
    settings.plexInstanceIds,
  );
  const jellyfinInstances = useWorkspaceScopedInstances(
    "jellyfin",
    settings.jellyfinInstanceIds,
  );
  const embyInstances = useWorkspaceScopedInstances(
    "emby",
    settings.embyInstanceIds,
  );

  // Flat list of (kind, instance) describing each session query, in display
  // order: Plex → Jellyfin → Emby.
  const sources = [
    ...plexInstances.map((inst) => ({ serviceId: "plex" as const, inst })),
    ...jellyfinInstances.map((inst) => ({ serviceId: "jellyfin" as const, inst })),
    ...embyInstances.map((inst) => ({ serviceId: "emby" as const, inst })),
  ];

  const queries = useQueries({
    queries: sources.map((src) => ({
      queryKey: [src.serviceId, src.inst.id, "sessions"] as const,
      queryFn: () =>
        src.serviceId === "plex"
          ? getPlexSessions(src.inst.id)
          : getMediaServerSessions(src.inst.id, src.serviceId),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });
  // Initial-load gate only — once any instance returns sessions we keep
  // rendering across refetches even if a sibling is failing its retry loop.
  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  const allStreams: NowPlayingStream[] = queries.flatMap((q, i) => {
    const src = sources[i]!;
    const data = q.data;
    if (!data) return [];
    if (src.serviceId === "plex") {
      return (data as PlexSession[]).map((s) => plexSessionToStream(s, src.inst.id));
    }
    return (data as JellyfinSession[]).map((s) =>
      mediaServerSessionToStream(s, src.inst.id, src.serviceId),
    );
  });

  const hiddenUsers = parseHiddenUsers(settings.hideUsers);
  const filtered = allStreams.filter((s) => {
    if (settings.hideLocalPlays && s.isLocal) return false;
    if (hiddenUsers.size > 0 && s.user && hiddenUsers.has(s.user.toLowerCase())) {
      return false;
    }
    return true;
  });

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;
  const viewAllRoute = `/(tabs)/${(display[0] ?? filtered[0])?.serviceId ?? sources[0]?.serviceId ?? "dashboard"}`;

  return (
    <Card>
      <CardHeaderLink
        title="Now Playing"
        onPress={sources.length > 0 ? () => router.push(viewAllRoute) : undefined}
        trailing={
          filtered.length > 0 ? (
            <Badge
              label={`${filtered.length} stream${filtered.length !== 1 ? "s" : ""}`}
              variant="success"
            />
          ) : null
        }
      />

      {sources.length === 0 ? (
        <EmptyState compact title="No media servers enabled" />
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
              showSource
            />
          ))}
          {hasMore && <ViewAllTile onPress={() => router.push(viewAllRoute)} />}
        </ScrollView>
      )}
    </Card>
  );
}
