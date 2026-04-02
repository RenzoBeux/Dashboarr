import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play, CheckCircle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useActiveTorrents, usePauseTorrent, useResumeTorrent } from "@/hooks/use-qbittorrent";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { formatSpeed, formatEta, truncateText } from "@/lib/utils";
import type { QBTorrent } from "@/lib/types";

const MAX_DISPLAY = 5;

export function DownloadCard() {
  const { data: torrents, isLoading } = useActiveTorrents();
  const router = useRouter();

  const displayTorrents = torrents?.slice(0, MAX_DISPLAY) ?? [];
  const hasMore = (torrents?.length ?? 0) > MAX_DISPLAY;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Downloads</CardTitle>
        {torrents && torrents.length > 0 && (
          <Text className="text-zinc-500 text-sm">{torrents.length}</Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : displayTorrents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} color="#71717a" />}
          title="No active downloads"
        />
      ) : (
        <View className="gap-3">
          {displayTorrents.map((torrent) => (
            <TorrentRow
              key={torrent.hash}
              torrent={torrent}
              onPress={() => router.push(`/torrent/${torrent.hash}`)}
            />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => router.push("/(tabs)/downloads")}
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

function TorrentRow({
  torrent,
  onPress,
}: {
  torrent: QBTorrent;
  onPress: () => void;
}) {
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();

  const isDownloading = torrent.state.includes("DL") || torrent.state === "downloading";
  const isPaused = torrent.state.includes("paused");

  const handleToggle = () => {
    lightHaptic();
    if (isPaused) {
      resumeMutation.mutate([torrent.hash]);
    } else {
      pauseMutation.mutate([torrent.hash]);
    }
  };

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm" numberOfLines={1}>
            {truncateText(torrent.name, 40)}
          </Text>
          <ProgressBar progress={torrent.progress} showLabel className="mt-1.5" />
          <View className="flex-row gap-3 mt-1">
            {isDownloading && (
              <Text className="text-zinc-500 text-xs">
                ↓ {formatSpeed(torrent.dlspeed)}
              </Text>
            )}
            {torrent.upspeed > 0 && (
              <Text className="text-zinc-500 text-xs">
                ↑ {formatSpeed(torrent.upspeed)}
              </Text>
            )}
            {torrent.eta > 0 && (
              <Text className="text-zinc-500 text-xs">
                ETA {formatEta(torrent.eta)}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={handleToggle}
          className="p-2 active:opacity-70"
          hitSlop={8}
        >
          {isPaused ? (
            <Play size={20} color="#3b82f6" />
          ) : (
            <Pause size={20} color="#f59e0b" />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}
