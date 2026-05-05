import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, PlayCircle, Cog } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePlexSessions } from "@/hooks/use-plex";
import { getPlexImageSource } from "@/services/plex-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  type PlexNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/plex-now-playing-settings";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
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

      {isLoading ? (
        <PosterSkeletonRow count={2} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<PlayCircle size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((session) => (
            <PlexSessionTile
              key={session.sessionKey}
              session={session}
              settings={settings}
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

function PlexSessionTile({
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

  const transcoding = isTranscoding(session);
  const showTranscodingPill =
    settings.showTranscoding && transcoding;

  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  const posterSource = getPlexImageSource(
    session.thumb || session.grandparentThumb,
    220,
    330,
  );

  const subtitle = settings.showUserAndDevice
    ? `${session.User.title} · ${session.Player.title}`
    : undefined;

  return (
    <MediaPosterTile
      posterUrl={posterSource}
      title={title}
      subtitle={subtitle}
      cornerBadge={{ icon: StateIcon, color: stateColor }}
      bottomLeftBadge={
        showTranscodingPill
          ? { icon: Cog, color: "rgba(245, 158, 11, 0.9)" }
          : undefined
      }
      bottomOverlay={<PosterProgressStrip progress={progress} />}
      mediaType={session.type === "episode" ? "tv" : "movie"}
    />
  );
}
