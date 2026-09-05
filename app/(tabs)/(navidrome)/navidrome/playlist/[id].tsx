import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Disc, ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { MediaStatsStrip, type MediaStat } from "@/components/common/media-stats-strip";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useNavidromePlaylist } from "@/hooks/use-navidrome";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { getCoverArtSource } from "@/services/navidrome-api";
import { openNavidromeWebUi } from "@/components/navidrome/open-web-ui";
import { ICON } from "@/lib/constants";
import { formatRuntime } from "@/lib/utils";
import type { NavidromeSong } from "@/lib/types";

export default function NavidromePlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = String(id ?? "");
  const { instanceId } = useInstanceTarget("navidrome");
  const { data, isLoading, error } = useNavidromePlaylist(playlistId);
  const { refreshing, onRefresh } = usePullToRefresh([["navidrome"]]);

  const stats: MediaStat[] = data
    ? [
        { label: "Tracks", value: String(data.songCount) },
        {
          label: "Duration",
          value: data.duration > 0 ? formatRuntime(Math.round(data.duration / 60)) : "—",
        },
        { label: "Owner", value: data.owner || "—" },
      ]
    : [];

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader
        title={data?.name ?? "Playlist"}
        right={
          <Pressable
            onPress={() => openNavidromeWebUi("playlist", playlistId, instanceId ?? undefined)}
            accessibilityRole="button"
            accessibilityLabel="Open in Navidrome"
            className="p-2 active:opacity-70"
          >
            <Icon icon={ExternalLink} size={ICON.LG} color="#a1a1aa" />
          </Pressable>
        }
      />

      {error ? <ErrorBanner error={error} /> : null}

      {isLoading ? (
        <SkeletonCardContent rows={6} />
      ) : !data ? (
        <EmptyState title="Playlist not found" />
      ) : (
        <View className="gap-4">
          {!!data.comment && (
            <Text className="text-zinc-400 text-sm leading-5">{data.comment}</Text>
          )}
          <MediaStatsStrip stats={stats} />
          {(data.entry?.length ?? 0) === 0 ? (
            <EmptyState compact title="This playlist is empty" />
          ) : (
            <View className="gap-2">
              {data.entry!.map((song, index) => (
                <TrackRow
                  key={song.id}
                  index={index + 1}
                  song={song}
                  instanceId={instanceId ?? ""}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </ScreenWrapper>
  );
}

/**
 * m:ss, the conventional track length. lib/utils' formatEta rounds to whole
 * minutes, which would render every track on an album as "3m" or "4m".
 */
function trackDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TrackRow({
  index,
  song,
  instanceId,
}: {
  index: number;
  song: NavidromeSong;
  instanceId: string;
}) {
  const art = getCoverArtSource(song.coverArt, 100, instanceId);
  return (
    <Pressable
      onPress={() => openNavidromeWebUi("album", song.albumId, instanceId || undefined)}
      accessibilityRole="button"
      accessibilityLabel={song.title}
      className="flex-row items-center gap-3 rounded-xl bg-surface-light border border-border px-3 py-2.5 active:opacity-70"
    >
      <Text className="text-zinc-600 text-xs w-6 text-right">{index}</Text>
      <View className="w-9 h-9 rounded-md overflow-hidden bg-surface items-center justify-center">
        {art ? (
          <Image source={art} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Icon icon={Disc} size={ICON.SM} color="#52525b" />
        )}
      </View>
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {song.title}
        </Text>
        <Text className="text-zinc-500 text-xs" numberOfLines={1}>
          {[song.artist, song.album].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {!!song.duration && (
        <Text className="text-zinc-500 text-xs">{trackDuration(song.duration)}</Text>
      )}
    </Pressable>
  );
}
