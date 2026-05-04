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
import {
  useAllRTTorrents,
  useRTTorrentFiles,
  usePauseRTTorrent,
  useResumeRTTorrent,
  useDeleteRTTorrent,
} from "@/hooks/use-rtorrent";
import { useConfigStore } from "@/store/config-store";
import { rtorrentStateToLabel } from "@/services/rtorrent-api";
import { formatBytes, formatSpeed, formatEta } from "@/lib/utils";

export default function TorrentDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const router = useRouter();

  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent.enabled);
  const activeClient = qbEnabled ? "qbittorrent" : rtEnabled ? "rtorrent" : null;
  const qbActive = activeClient === "qbittorrent";
  const rtActive = activeClient === "rtorrent";

  // qBittorrent hooks
  const { data: qbTorrents } = useAllTorrents(undefined, qbActive);
  const { data: qbFiles } = useTorrentFiles(hash, qbActive);
  useTorrentTrackers(hash, qbActive); // keep subscribed for cache warmth
  const qbPause = usePauseTorrent();
  const qbResume = useResumeTorrent();
  const qbDelete = useDeleteTorrent();

  // rTorrent hooks
  const { data: rtTorrents } = useAllRTTorrents(undefined, rtActive);
  const { data: rtFiles } = useRTTorrentFiles(hash, rtActive);
  const rtPause = usePauseRTTorrent();
  const rtResume = useResumeRTTorrent();
  const rtDelete = useDeleteRTTorrent();

  const qbTorrent = qbTorrents?.find((t) => t.hash === hash);
  const rtTorrent = rtTorrents?.find((t) => t.hash === hash);

  // --- rTorrent detail ---
  if (activeClient === "rtorrent") {
    if (!rtTorrent) {
      return (
        <ScreenWrapper>
          <Text className="text-zinc-400 text-center mt-10">Torrent not found</Text>
        </ScreenWrapper>
      );
    }

    const state = rtorrentStateToLabel(rtTorrent);
    const isPaused = state === "paused" || state === "stopped";
    const progress = rtTorrent.size > 0 ? rtTorrent.bytes_done / rtTorrent.size : 0;

    const handleDelete = () => {
      Alert.alert("Delete Torrent", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            rtDelete.mutate({ hashes: [hash] });
            router.back();
          },
        },
        {
          text: "Delete + Files",
          style: "destructive",
          onPress: () => {
            rtDelete.mutate({
              hashes: [hash],
              deleteFiles: true,
              basePaths: [rtTorrent.base_path],
            });
            router.back();
          },
        },
      ]);
    };

    return (
      <ScreenWrapper>
        <Text className="text-zinc-100 text-lg font-bold mt-2 mb-1">
          {rtTorrent.name}
        </Text>
        <Badge
          label={state}
          variant={isPaused ? "paused" : state === "seeding" ? "seeding" : "downloading"}
          className="self-start mb-4"
        />

        <Card className="mb-4">
          <ProgressBar progress={progress} showLabel className="mb-3" />
          <View className="flex-row justify-between">
            <View className="flex-row items-center gap-1">
              <ArrowDown size={14} color="#3b82f6" />
              <Text className="text-zinc-300 text-sm">
                {formatSpeed(rtTorrent.dl_rate)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <ArrowUp size={14} color="#22c55e" />
              <Text className="text-zinc-300 text-sm">
                {formatSpeed(rtTorrent.up_rate)}
              </Text>
            </View>
          </View>
        </Card>

        <Card className="mb-4 gap-2">
          <InfoRow label="Size" value={formatBytes(rtTorrent.size)} />
          <InfoRow label="Downloaded" value={formatBytes(rtTorrent.bytes_done)} />
          <InfoRow label="Ratio" value={(rtTorrent.ratio / 1000).toFixed(2)} />
          <InfoRow label="Peers" value={String(rtTorrent.peers_connected)} />
          <InfoRow label="Save Path" value={rtTorrent.base_path} />
        </Card>

        {rtFiles && rtFiles.length > 0 && (
          <Card className="mb-4">
            <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
              Files ({rtFiles.length})
            </Text>
            {rtFiles.slice(0, 10).map((file, i) => {
              const fileProgress =
                file.size_chunks > 0
                  ? Math.round((file.completed_chunks / file.size_chunks) * 100)
                  : 0;
              return (
                <View key={i} className="py-1.5 border-b border-border/50">
                  <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                    {file.path}
                  </Text>
                  <Text className="text-zinc-500 text-[10px]">
                    {formatBytes(file.size_bytes)} — {fileProgress}%
                  </Text>
                </View>
              );
            })}
            {rtFiles.length > 10 && (
              <Text className="text-zinc-500 text-xs mt-2">
                +{rtFiles.length - 10} more files
              </Text>
            )}
          </Card>
        )}

        <View className="flex-row gap-3">
          <Button
            label={isPaused ? "Resume" : "Pause"}
            variant="outline"
            onPress={() =>
              isPaused
                ? rtResume.mutate([hash])
                : rtPause.mutate([hash])
            }
            loading={rtPause.isPending || rtResume.isPending}
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
            loading={rtDelete.isPending}
            icon={<Trash2 size={16} color="white" />}
            className="flex-1"
          />
        </View>
      </ScreenWrapper>
    );
  }

  // --- qBittorrent detail (default) ---
  if (!qbTorrent) {
    return (
      <ScreenWrapper>
        <Text className="text-zinc-400 text-center mt-10">Torrent not found</Text>
      </ScreenWrapper>
    );
  }

  const isPaused = qbTorrent.state.includes("paused");

  const handleDelete = () => {
    Alert.alert("Delete Torrent", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          qbDelete.mutate({ hashes: [hash] });
          router.back();
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          qbDelete.mutate({ hashes: [hash], deleteFiles: true });
          router.back();
        },
      },
    ]);
  };

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-lg font-bold mt-2 mb-1">
        {qbTorrent.name}
      </Text>
      <Badge
        label={qbTorrent.state}
        variant={isPaused ? "paused" : "downloading"}
        className="self-start mb-4"
      />

      <Card className="mb-4">
        <ProgressBar progress={qbTorrent.progress} showLabel className="mb-3" />
        <View className="flex-row justify-between">
          <View className="flex-row items-center gap-1">
            <ArrowDown size={14} color="#3b82f6" />
            <Text className="text-zinc-300 text-sm">
              {formatSpeed(qbTorrent.dlspeed)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <ArrowUp size={14} color="#22c55e" />
            <Text className="text-zinc-300 text-sm">
              {formatSpeed(qbTorrent.upspeed)}
            </Text>
          </View>
          {qbTorrent.eta > 0 && qbTorrent.eta < 8640000 && (
            <Text className="text-zinc-400 text-sm">ETA {formatEta(qbTorrent.eta)}</Text>
          )}
        </View>
      </Card>

      <Card className="mb-4 gap-2">
        <InfoRow label="Size" value={formatBytes(qbTorrent.size)} />
        <InfoRow label="Downloaded" value={formatBytes(qbTorrent.downloaded)} />
        <InfoRow label="Uploaded" value={formatBytes(qbTorrent.uploaded)} />
        <InfoRow label="Ratio" value={qbTorrent.ratio.toFixed(2)} />
        <InfoRow label="Seeds" value={String(qbTorrent.num_seeds)} />
        <InfoRow label="Peers" value={String(qbTorrent.num_leechs)} />
        <InfoRow label="Save Path" value={qbTorrent.save_path} />
      </Card>

      {qbFiles && qbFiles.length > 0 && (
        <Card className="mb-4">
          <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
            Files ({qbFiles.length})
          </Text>
          {qbFiles.slice(0, 10).map((file) => (
            <View key={file.index} className="py-1.5 border-b border-border/50">
              <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                {file.name}
              </Text>
              <Text className="text-zinc-500 text-[10px]">
                {formatBytes(file.size)} — {Math.round(file.progress * 100)}%
              </Text>
            </View>
          ))}
          {qbFiles.length > 10 && (
            <Text className="text-zinc-500 text-xs mt-2">
              +{qbFiles.length - 10} more files
            </Text>
          )}
        </Card>
      )}

      <View className="flex-row gap-3">
        <Button
          label={isPaused ? "Resume" : "Pause"}
          variant="outline"
          onPress={() =>
            isPaused
              ? qbResume.mutate([hash])
              : qbPause.mutate([hash])
          }
          loading={qbPause.isPending || qbResume.isPending}
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
          loading={qbDelete.isPending}
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
