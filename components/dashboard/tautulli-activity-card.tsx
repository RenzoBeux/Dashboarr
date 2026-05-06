import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, MonitorPlay, Cog } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useTautulliActivity } from "@/hooks/use-tautulli";
import { getTautulliImageSource } from "@/services/tautulli-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  type TautulliActivitySettingsValue,
} from "@/components/dashboard/widget-settings/tautulli-activity-settings";
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

export function TautulliActivityCard() {
  const { settings } = useWidgetSettings<TautulliActivitySettingsValue>(
    "tautulli-activity",
    TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  );
  const { data: activity, isLoading } = useTautulliActivity();
  const router = useRouter();

  const allSessions = activity?.sessions ?? [];
  const hiddenUsers = parseHiddenUsers(settings.hideUsers);
  const sessions = hiddenUsers.size
    ? allSessions.filter((s) => !hiddenUsers.has(s.user.toLowerCase()))
    : allSessions;

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

      {isLoading ? (
        <PosterSkeletonRow count={2} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<Icon icon={MonitorPlay} size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((session) => (
            <TautulliSessionTile
              key={session.session_key}
              session={session}
              settings={settings}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/activity")} />
          )}
        </ScrollView>
      )}

      {settings.showBandwidthSummary && sessions.length > 0 && activity && (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-border/50">
          <Text className="text-zinc-500 text-xs">
            Bandwidth: {formatBytes(activity.total_bandwidth * 1000)}/s
          </Text>
        </View>
      )}
    </Card>
  );
}

function TautulliSessionTile({
  session,
  settings,
}: {
  session: TautulliSession;
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
    ? getTautulliImageSource(ratingKey, 220, 330)
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
