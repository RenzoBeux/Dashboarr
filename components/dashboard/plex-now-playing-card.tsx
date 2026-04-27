import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, PlayCircle, Cog } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { usePlexSessions } from "@/hooks/use-plex";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  type PlexNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/plex-now-playing-settings";
import { truncateText } from "@/lib/utils";
import type { PlexSession } from "@/lib/types";

function parseHiddenUsers(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isTranscoding(session: PlexSession): boolean {
  return (
    session.TranscodeSession?.videoDecision === "transcode" ||
    session.TranscodeSession?.audioDecision === "transcode"
  );
}

export function PlexNowPlayingCard() {
  const { settings } = useWidgetSettings<PlexNowPlayingSettingsValue>(
    "plex-now-playing",
    PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  );
  const { data: sessions, isLoading } = usePlexSessions();
  const router = useRouter();

  const hiddenUsers = parseHiddenUsers(settings.hideUsers);

  const filtered = (sessions ?? []).filter((session) => {
    if (settings.hideLocalPlays && session.Player.local) return false;
    if (
      hiddenUsers.size > 0 &&
      hiddenUsers.has(session.User.title.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plex</CardTitle>
        {filtered.length > 0 && (
          <Badge
            label={`${filtered.length} stream${filtered.length !== 1 ? "s" : ""}`}
            variant="success"
          />
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<PlayCircle size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <View className="gap-3">
          {display.map((session) => (
            <PlexSessionRow
              key={session.sessionKey}
              session={session}
              settings={settings}
            />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => router.push("/(tabs)/plex")}
              className="active:opacity-70"
            >
              <Text className="text-primary text-sm text-center font-medium">
                View All →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

function PlexSessionRow({
  session,
  settings,
}: {
  session: PlexSession;
  settings: PlexNowPlayingSettingsValue;
}) {
  const progress = session.duration > 0 ? session.viewOffset / session.duration : 0;
  const isPaused = session.Player.state === "paused";
  const isBuffering = session.Player.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  const transcoding = isTranscoding(session);
  const bitrateKbps = session.Session?.bandwidth ?? 0;

  const subtitleParts: string[] = [];
  if (settings.showUserAndDevice) {
    subtitleParts.push(`${session.User.title} · ${session.Player.title}`);
  }
  if (settings.showBitrate && bitrateKbps > 0) {
    subtitleParts.push(`${(bitrateKbps / 1000).toFixed(1)} Mbps`);
  }

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1">
        <StateIcon size={14} color={stateColor} />
        <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
          {truncateText(title, 30)}
        </Text>
        {settings.showTranscoding && transcoding && (
          <View className="flex-row items-center gap-1">
            <Cog size={12} color="#f59e0b" />
            <Text className="text-amber-500 text-[10px] font-semibold uppercase">
              Transcode
            </Text>
          </View>
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
