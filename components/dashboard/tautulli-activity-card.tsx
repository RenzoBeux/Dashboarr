import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, Cog } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivity, getTautulliImageSource } from "@/services/tautulli-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  type TautulliActivitySettingsValue,
} from "@/components/dashboard/widget-settings/tautulli-activity-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { formatBytes } from "@/lib/utils";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import type { TautulliSession } from "@/lib/types";

function parseHiddenUsers(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function TautulliActivityCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<TautulliActivitySettingsValue>(
    slotId,
    TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  );
  const allInstances = useEnabledInstances("tautulli");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);
  const router = useRouter();

  // Fan out across the resolved Tautulli instances. Sessions from each get
  // tagged with their source instance so the React key stays unique even when
  // session_key collides across hosts.
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["tautulli", inst.id, "activity"] as const,
      queryFn: () => getActivity(inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });

  // Initial-load gate only — see lib/multi-instance-query.ts. We keep the
  // already-loaded sessions visible across refetches even if a sibling
  // Tautulli is currently failing.
  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  const allSessions = queries.flatMap((q, i) =>
    (q.data?.sessions ?? []).map((s) => ({ session: s, instanceId: instances[i].id })),
  );
  const hiddenUsers = parseHiddenUsers(settings.hideUsers);
  const sessions = hiddenUsers.size
    ? allSessions.filter(({ session }) => !hiddenUsers.has(session.user.toLowerCase()))
    : allSessions;

  const totalBandwidth = queries.reduce(
    (acc, q) => acc + (q.data?.total_bandwidth ?? 0),
    0,
  );

  const display = sessions.slice(0, settings.maxItems);
  const hasMore = sessions.length > settings.maxItems;

  return (
    <Card>
      <CardHeaderLink
        title="Now Playing"
        onPress={() => router.push("/(tabs)/activity")}
        trailing={
          sessions.length > 0 ? (
            <Badge
              label={`${sessions.length} stream${sessions.length !== 1 ? "s" : ""}`}
              variant="success"
            />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title="No Tautulli instances enabled" />
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
          {display.map(({ session, instanceId }) => (
            <TautulliSessionTile
              key={`${instanceId}:${session.session_key}`}
              session={session}
              instanceId={instanceId}
              settings={settings}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/activity")} />
          )}
        </ScrollView>
      )}

      {settings.showBandwidthSummary && sessions.length > 0 && (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-border/50">
          <Text className="text-zinc-500 text-xs">
            Bandwidth: {formatBytes(totalBandwidth * 1000)}/s
          </Text>
        </View>
      )}
    </Card>
  );
}

function TautulliSessionTile({
  session,
  instanceId,
  settings,
}: {
  session: TautulliSession;
  instanceId: string;
  settings: TautulliActivitySettingsValue;
}) {
  const progress = parseInt(session.progress_percent, 10) / 100;
  const isPaused = session.state === "paused";
  const isBuffering = session.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const transcoding = session.transcode_decision === "transcode";
  const showTranscodingPill = settings.showTranscoding && transcoding;

  // For episodes prefer the show poster (grandparent_rating_key); fall back to
  // the item itself.
  const ratingKey =
    session.media_type === "episode" && session.grandparent_rating_key
      ? session.grandparent_rating_key
      : session.rating_key;
  const posterSource = ratingKey
    ? getTautulliImageSource(ratingKey, 220, 330, instanceId)
    : null;

  const subtitle = settings.showUserAndDevice
    ? `${session.user} · ${session.player}`
    : undefined;

  return (
    <MediaPosterTile
      posterUrl={posterSource}
      title={session.full_title}
      subtitle={subtitle}
      cornerBadge={{ icon: StateIcon, color: stateColor }}
      bottomLeftBadge={
        showTranscodingPill
          ? { icon: Cog, color: "rgba(245, 158, 11, 0.9)" }
          : undefined
      }
      bottomOverlay={<PosterProgressStrip progress={progress} />}
      mediaType={session.media_type === "episode" ? "tv" : "movie"}
    />
  );
}
