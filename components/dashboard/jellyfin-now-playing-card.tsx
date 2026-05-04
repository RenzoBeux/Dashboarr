import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, PlayCircle, Cog } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useJellyfinSessions } from "@/hooks/use-jellyfin";
import { isJellyfinTranscoding, ticksToMs } from "@/services/jellyfin-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS,
  type JellyfinNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/jellyfin-now-playing-settings";
import { truncateText } from "@/lib/utils";
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

  // Bracketed IPv6 like `[::1]:8443` — pull the address from inside the brackets.
  // Bare IPv6 (e.g. `fe80::abc`) is left intact since splitting on `:` would
  // shred it; for IPv4 / hostnames we strip a trailing `:port` if present.
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
  // IPv6 link-local (fe80::/10) and ULA (fc00::/7).
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
      <CardHeader>
        <CardTitle>Jellyfin</CardTitle>
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
            <JellyfinSessionRow
              key={session.Id}
              session={session}
              settings={settings}
            />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => router.push("/(tabs)/jellyfin")}
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

function JellyfinSessionRow({
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
  // Jellyfin reports playback "buffering" via TranscodingInfo.CompletionPercentage
  // rather than a discrete state — we just collapse it into the transcoding case.
  const StateIcon = isPaused ? Pause : transcoding ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : transcoding ? "#f59e0b" : "#22c55e";

  const title =
    item?.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} — ${item.Name}`
      : (item?.Name ?? "Unknown");

  const bitrateKbps = session.TranscodingInfo?.Bitrate
    ? Math.round(session.TranscodingInfo.Bitrate / 1000)
    : 0;

  const subtitleParts: string[] = [];
  if (settings.showUserAndDevice && (session.UserName || session.Client)) {
    subtitleParts.push(
      [session.UserName, session.Client].filter(Boolean).join(" · "),
    );
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
