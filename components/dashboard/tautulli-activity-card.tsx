import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, MonitorPlay, Cog } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useTautulliActivity } from "@/hooks/use-tautulli";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  type TautulliActivitySettingsValue,
} from "@/components/dashboard/widget-settings/tautulli-activity-settings";
import { formatBytes, truncateText } from "@/lib/utils";
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
      <CardHeader>
        <CardTitle>Now Playing</CardTitle>
        {sessions.length > 0 && (
          <Badge
            label={`${sessions.length} stream${sessions.length !== 1 ? "s" : ""}`}
            variant="success"
          />
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<MonitorPlay size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <View className="gap-3">
          {display.map((session) => (
            <SessionRow
              key={session.session_key}
              session={session}
              settings={settings}
            />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => router.push("/(tabs)/activity")}
              className="active:opacity-70"
            >
              <Text className="text-primary text-sm text-center font-medium">
                View All →
              </Text>
            </Pressable>
          )}
        </View>
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

function SessionRow({
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
  const bitrateKbps = parseInt(session.bandwidth, 10);

  const subtitleParts: string[] = [];
  if (settings.showUserAndDevice) {
    subtitleParts.push(`${session.user} · ${session.player}`);
  }
  if (settings.showTranscoding) {
    subtitleParts.push(session.transcode_decision);
  }
  if (settings.showBitrate && Number.isFinite(bitrateKbps) && bitrateKbps > 0) {
    subtitleParts.push(`${(bitrateKbps / 1000).toFixed(1)} Mbps`);
  }

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1">
        <StateIcon size={14} color={stateColor} />
        <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
          {truncateText(session.full_title, 35)}
        </Text>
        {settings.showTranscoding && transcoding && (
          <Cog size={12} color="#f59e0b" />
        )}
      </View>
      <ProgressBar progress={progress} className="mb-1" />
      {subtitleParts.length > 0 && (
        <Text className="text-zinc-500 text-xs" numberOfLines={1}>
          {subtitleParts.join(" · ")}
        </Text>
      )}
    </View>
  );
}
