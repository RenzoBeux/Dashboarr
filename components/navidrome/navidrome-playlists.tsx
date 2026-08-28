import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, ListMusic } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useNavidromePlaylists } from "@/hooks/use-navidrome";
import { ICON } from "@/lib/constants";
import { formatRuntime } from "@/lib/utils";
import type { NavidromePlaylist } from "@/lib/types";

/** Playlists tab: a flat list, tapping through to the track listing. */
export function NavidromePlaylists({ instanceId }: { instanceId?: string }) {
  const { data, isLoading, error } = useNavidromePlaylists(instanceId);
  const router = useRouter();

  if (error) return <ErrorBanner error={error} />;
  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={ListMusic} size={ICON.XL} color="#52525b" />}
        title="No playlists"
        message="Playlists you create in Navidrome, or import as .m3u, show up here."
      />
    );
  }

  return (
    <View className="gap-2">
      {data.map((playlist) => (
        <PlaylistRow
          key={playlist.id}
          playlist={playlist}
          onPress={() => router.push(`/navidrome/playlist/${playlist.id}`)}
        />
      ))}
    </View>
  );
}

function PlaylistRow({
  playlist,
  onPress,
}: {
  playlist: NavidromePlaylist;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playlist.name}
      className="flex-row items-center gap-3 rounded-xl bg-surface-light border border-border px-3 py-3 active:opacity-70"
    >
      <Icon icon={ListMusic} size={ICON.MD} color="#a1a1aa" />
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm font-semibold" numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text className="text-zinc-500 text-xs" numberOfLines={1}>
          {playlist.songCount} track{playlist.songCount !== 1 ? "s" : ""}
          {playlist.duration > 0 ? ` · ${formatRuntime(Math.round(playlist.duration / 60))}` : ""}
        </Text>
      </View>
      {playlist.public && <Badge label="Public" variant="info" />}
      <Icon icon={ChevronRight} size={ICON.SM} color="#52525b" />
    </Pressable>
  );
}
