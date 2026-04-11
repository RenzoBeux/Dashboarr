import { View, Text, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pause, Play, Trash2, ArrowDown, ArrowUp } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import {
  useAllTorrents,
  useTorrentFiles,
  useTorrentTrackers,
  usePauseTorrent,
  useResumeTorrent,
  useDeleteTorrent,
} from "@/hooks/use-qbittorrent";
import { formatBytes, formatSpeed, formatEta } from "@/lib/utils";

export default function TorrentDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const router = useRouter();
  const { data: torrents } = useAllTorrents();
  const { data: files } = useTorrentFiles(hash);
  const { data: trackers } = useTorrentTrackers(hash);
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const deleteMutation = useDeleteTorrent();

  const torrent = torrents?.find((t) => t.hash === hash);

  if (!torrent) {
    return (
      <ScreenWrapper>
        <Text className="text-zinc-400 text-center mt-10">Torrent not found</Text>
      </ScreenWrapper>
    );
  }

  const isPaused = torrent.state.includes("paused");

  const handleDelete = () => {
    Alert.alert("Delete Torrent", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ hashes: [hash] });
          router.back();
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ hashes: [hash], deleteFiles: true });
          router.back();
        },
      },
    ]);
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <Text className="text-zinc-100 text-lg font-bold mt-2 mb-1">
        {torrent.name}
      </Text>
      <Badge
        label={torrent.state}
        variant={isPaused ? "paused" : "downloading"}
        className="self-start mb-4"
      />

      {/* Progress */}
      <Card className="mb-4">
        <ProgressBar progress={torrent.progress} showLabel className="mb-3" />
        <View className="flex-row justify-between">
          <View className="flex-row items-center gap-1">
            <ArrowDown size={14} color="#3b82f6" />
            <Text className="text-zinc-300 text-sm">
              {formatSpeed(torrent.dlspeed)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <ArrowUp size={14} color="#22c55e" />
            <Text className="text-zinc-300 text-sm">
              {formatSpeed(torrent.upspeed)}
            </Text>
          </View>
          {torrent.eta > 0 && torrent.eta < 8640000 && (
            <Text className="text-zinc-400 text-sm">ETA {formatEta(torrent.eta)}</Text>
          )}
        </View>
      </Card>

      {/* Info */}
      <Card className="mb-4 gap-2">
        <InfoRow label="Size" value={formatBytes(torrent.size)} />
        <InfoRow label="Downloaded" value={formatBytes(torrent.downloaded)} />
        <InfoRow label="Uploaded" value={formatBytes(torrent.uploaded)} />
        <InfoRow label="Ratio" value={torrent.ratio.toFixed(2)} />
        <InfoRow label="Seeds" value={String(torrent.num_seeds)} />
        <InfoRow label="Peers" value={String(torrent.num_leechs)} />
        <InfoRow label="Save Path" value={torrent.save_path} />
      </Card>

      {/* Files */}
      {files && files.length > 0 && (
        <Card className="mb-4">
          <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
            Files ({files.length})
          </Text>
          {files.slice(0, 10).map((file) => (
            <View key={file.index} className="py-1.5 border-b border-border/50">
              <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                {file.name}
              </Text>
              <Text className="text-zinc-500 text-[10px]">
                {formatBytes(file.size)} — {Math.round(file.progress * 100)}%
              </Text>
            </View>
          ))}
          {files.length > 10 && (
            <Text className="text-zinc-500 text-xs mt-2">
              +{files.length - 10} more files
            </Text>
          )}
        </Card>
      )}

      {/* Actions */}
      <View className="flex-row gap-3">
        <Button
          label={isPaused ? "Resume" : "Pause"}
          variant="outline"
          onPress={() =>
            isPaused
              ? resumeMutation.mutate([hash])
              : pauseMutation.mutate([hash])
          }
          loading={pauseMutation.isPending || resumeMutation.isPending}
          icon={
            isPaused ? (
              <Play size={16} color="#3b82f6" />
            ) : (
              <Pause size={16} color="#f59e0b" />
            )
          }
          className="flex-1"
        />
        <Button
          label="Delete"
          variant="danger"
          onPress={handleDelete}
          loading={deleteMutation.isPending}
          icon={<Trash2 size={16} color="white" />}
          className="flex-1"
        />
      </View>
    </ScreenWrapper>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-zinc-500 text-sm">{label}</Text>
      <Text className="text-zinc-300 text-sm" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
