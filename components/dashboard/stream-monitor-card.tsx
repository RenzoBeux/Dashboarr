import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import { getMonitorAdapter, type MonitorKind } from "@/lib/monitor-adapter";
import { parseHiddenUsers } from "@/lib/now-playing-stream";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import { NowPlayingStreamTile } from "@/components/dashboard/now-playing-stream-tile";
import {
  STREAM_MONITOR_DEFAULT_SETTINGS,
  type StreamMonitorSettingsValue,
} from "@/components/dashboard/widget-settings/stream-monitor-settings";

// Unified "Now Playing" across every enabled Tautulli + Tracearr instance, in
// one poster row. Both are active-stream monitors, so they normalize through
// lib/monitor-adapter.ts into the shared NowPlayingStream and render with the
// same tile as the media-server cards (issue #25).
export function StreamMonitorCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<StreamMonitorSettingsValue>(
    slotId,
    STREAM_MONITOR_DEFAULT_SETTINGS,
  );
  const router = useRouter();

  const tautulliInstances = resolveBoundInstances(
    settings.tautulliInstanceIds,
    useEnabledInstances("tautulli"),
  );
  const tracearrInstances = resolveBoundInstances(
    settings.tracearrInstanceIds,
    useEnabledInstances("tracearr"),
  );

  const sources = [
    ...tautulliInstances.map((inst) => ({ kind: "tautulli" as MonitorKind, inst })),
    ...tracearrInstances.map((inst) => ({ kind: "tracearr" as MonitorKind, inst })),
  ];

  // Same query keys as the Activity tab so a dashboard holding both shares fetches.
  const queries = useQueries({
    queries: sources.map((src) => ({
      queryKey: ["monitor", src.kind, src.inst.id, "activity"] as const,
      queryFn: () => getMonitorAdapter(src.kind).getActivity(src.inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });

  // Initial-load gate only — keep loaded streams visible across refetches even
  // if a sibling monitor is currently failing.
  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  const allStreams = queries.flatMap((q) => q.data?.streams ?? []);
  const hiddenUsers = parseHiddenUsers(settings.hideUsers);
  const streams = hiddenUsers.size
    ? allStreams.filter((s) => !(s.user && hiddenUsers.has(s.user.toLowerCase())))
    : allStreams;

  // Show the source logo on each tile only when both monitors contribute.
  const showSource = tautulliInstances.length > 0 && tracearrInstances.length > 0;

  const display = streams.slice(0, settings.maxItems);
  const hasMore = streams.length > settings.maxItems;

  const bandwidthLabels = queries
    .map((q) => q.data?.bandwidthLabel)
    .filter((l): l is string => !!l);

  return (
    <Card>
      <CardHeaderLink
        title="Now Playing"
        onPress={() => router.push("/(tabs)/activity")}
        trailing={
          streams.length > 0 ? (
            <Badge
              label={`${streams.length} stream${streams.length !== 1 ? "s" : ""}`}
              variant="success"
            />
          ) : null
        }
      />

      {sources.length === 0 ? (
        <EmptyState compact title="No stream monitor enabled" />
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
              showSource={showSource}
            />
          ))}
          {hasMore && <ViewAllTile onPress={() => router.push("/(tabs)/activity")} />}
        </ScrollView>
      )}

      {settings.showBandwidthSummary && streams.length > 0 && bandwidthLabels.length > 0 && (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-border/50">
          <Text className="text-zinc-500 text-xs">
            Bandwidth: {bandwidthLabels.join(" · ")}
          </Text>
        </View>
      )}
    </Card>
  );
}
