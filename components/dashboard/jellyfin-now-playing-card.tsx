import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, PlayCircle, Cog } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useJellyfinSessions } from "@/hooks/use-jellyfin";
import {
  isJellyfinTranscoding,
  ticksToMs,
  getJellyfinImageSource,
} from "@/services/jellyfin-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS,
  type JellyfinNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/jellyfin-now-playing-settings";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";
import type { JellyfinSession } from "@/lib/types";

function parseHiddenUsers(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Jellyfin doesn't tag sessions as local/remote like Plex does, so we sniff
// the RemoteEndPoint for the standard RFC1918 ranges + IPv6 link-local/ULA.
// Good enough for "hide my own TV from the dashboard" — not a security boundary.
function isLocalEndpoint(remote: string | undefined): boolean {
  if (!remote) return false;
  const r = remote.toLowerCase().trim();
  if (!r) return false;

  let host: string;
  if (r.startsWith("[")) {
    const end = r.indexOf("]");
    host = end > 1 ? r.slice(1, end) : r.slice(1);
  } else if (r.includes(".") || r.split(":").length === 2) {
    host = r.split(":")[0]!;
  } else {
    host = r;
  }

  if (!host) return false;
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host.startsWith("fe80:") || host.startsWith("fe80::")) return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
}

export function JellyfinNowPlayingCard() {
  const { settings } = useWidgetSettings<JellyfinNowPlayingSettingsValue>(
    "jellyfin-now-playing",
    JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS,
  );
  const { data: sessions, isLoading } = useJellyfinSessions();
  const router = useRouter();

  const hiddenUsers = parseHiddenUsers(settings.hideUsers);

  const filtered = (sessions ?? []).filter((session) => {
    if (settings.hideLocalPlays && isLocalEndpoint(session.RemoteEndPoint)) return false;
    const userName = session.UserName?.toLowerCase();
    if (hiddenUsers.size > 0 && userName && hiddenUsers.has(userName)) {
      return false;
    }
    return true;
  });

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;

  return (
    <Card>
      <CardHeaderLink
        title="Jellyfin"
        onPress={() => router.push("/(tabs)/jellyfin")}
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
          icon={<Icon icon={PlayCircle} size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((session) => (
            <JellyfinSessionTile
              key={session.Id}
              session={session}
              settings={settings}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/jellyfin")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}

function JellyfinSessionTile({
  session,
  settings,
}: {
  session: JellyfinSession;
  settings: JellyfinNowPlayingSettingsValue;
}) {
  const item = session.NowPlayingItem;
  const durationMs = ticksToMs(item?.RunTimeTicks);
  const positionMs = ticksToMs(session.PlayState?.PositionTicks);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  const isPaused = !!session.PlayState?.IsPaused;
  const transcoding = isJellyfinTranscoding(session);
  const StateIcon = isPaused ? Pause : transcoding ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : transcoding ? "#f59e0b" : "#22c55e";

  const title =
    item?.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} — ${item.Name}`
      : (item?.Name ?? "Unknown");

  const posterSource = getJellyfinImageSource(item ?? null, "Primary", 220, 330);

  const subtitle =
    settings.showUserAndDevice && (session.UserName || session.Client)
      ? [session.UserName, session.Client].filter(Boolean).join(" · ")
      : undefined;

  const showTranscodingPill = settings.showTranscoding && transcoding;

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
      mediaType={item?.Type === "Episode" ? "tv" : "movie"}
    />
  );
}
