import { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Pause,
  Play,
  Trash2,
  ArrowDown,
  ArrowUp,
  Gauge,
  Megaphone,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { ActionSheet } from "@/components/ui/action-sheet";
import { toast, toastError } from "@/components/ui/toast";
import { ShareLimitsSheet } from "@/components/qbittorrent/share-limits-sheet";
import { useDeferredBack } from "@/hooks/use-deferred-back";
import {
  useTorrent,
  useTorrentFiles,
  useTorrentTrackers,
  usePauseTorrent,
  useResumeTorrent,
  useReannounceTorrent,
  useDeleteTorrent,
} from "@/hooks/use-qbittorrent";
import { formatBytes, formatSpeed, formatEta } from "@/lib/utils";
import { isTorrentPaused } from "@/lib/types";

export default function TorrentDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const { data: torrent, isLoading, error } = useTorrent(hash);
  const { data: files } = useTorrentFiles(hash);
  const { data: trackers } = useTorrentTrackers(hash);
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const reannounceMutation = useReannounceTorrent();
  const deleteMutation = useDeleteTorrent();
  const [shareLimitsOpen, setShareLimitsOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const deferredBack = useDeferredBack();

  if (!torrent) {
    return (
      <ScreenWrapper>
        <BackHeader />
        {error ? (
          <ErrorBanner
            error={error}
            title="Failed to load torrent"
            className="mt-4"
          />
        ) : isLoading ? (
          <View className="items-center justify-center mt-10">
            <ActivityIndicator color="#3b82f6" />
          </View>
        ) : (
          <Text className="text-zinc-400 text-center mt-10">
            Torrent not found
          </Text>
        )}
      </ScreenWrapper>
    );
  }

  const isPaused = isTorrentPaused(torrent.state);

  const handleReannounce = () => {
    reannounceMutation.mutate([hash], {
      onSuccess: () => toast("Reannounce requested"),
      onError: (err) => toastError("Failed to reannounce", err),
    });
  };

  const runDelete = (deleteFiles: boolean) => {
    deleteMutation.mutate({ hashes: [hash], deleteFiles });
    // Pop back, but only once the sheet is fully dismissed — navigating mid-
    // dismiss hangs the JS thread on iOS/Fabric. See useDeferredBack.
    deferredBack.arm();
    deferredBack.back();
  };

  return (
    <>
      <ScreenWrapper>
        <BackHeader />
        {/* Header */}
        <Text className="text-zinc-100 text-lg font-bold mb-1">
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
              <Icon icon={ArrowDown} size={14} color="#3b82f6" />
              <Text className="text-zinc-300 text-sm">
                {formatSpeed(torrent.dlspeed)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon icon={ArrowUp} size={14} color="#22c55e" />
              <Text className="text-zinc-300 text-sm">
                {formatSpeed(torrent.upspeed)}
              </Text>
            </View>
            {torrent.eta > 0 && torrent.eta < 8640000 && (
              <Text className="text-zinc-400 text-sm">
                ETA {formatEta(torrent.eta)}
              </Text>
            )}
          </View>
        </Card>

        {/* Info */}
        <Card className="mb-4 gap-2">
          <InfoRow label="Size" value={formatBytes(torrent.size)} />
          <InfoRow label="Downloaded" value={formatBytes(torrent.downloaded)} />
          <InfoRow label="Uploaded" value={formatBytes(torrent.uploaded)} />
          <InfoRow label="Ratio" value={torrent.ratio.toFixed(2)} />
          <InfoRow
            label="Ratio Limit"
            value={formatRatioLimit(torrent.ratio_limit)}
          />
          <InfoRow
            label="Seed Time Limit"
            value={formatSeedTimeLimit(torrent.seeding_time_limit)}
          />
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
              <View
                key={file.index}
                className="py-1.5 border-b border-border/50"
              >
                <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                  {file.name}
                </Text>
                <Text className="text-zinc-500 text-xs">
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
                <Icon icon={Play} size={16} color="#3b82f6" />
              ) : (
                <Icon icon={Pause} size={16} color="#f59e0b" />
              )
            }
            className="flex-1"
          />
          <Button
            label="Delete"
            variant="danger"
            onPress={() => setDeleteSheetOpen(true)}
            loading={deleteMutation.isPending}
            icon={<Icon icon={Trash2} size={16} color="white" />}
            className="flex-1"
          />
        </View>

        <View className="flex-row gap-3 mt-3">
          <Button
            label="Reannounce"
            variant="outline"
            onPress={handleReannounce}
            loading={reannounceMutation.isPending}
            icon={<Icon icon={Megaphone} size={16} color="#a1a1aa" />}
            className="flex-1"
          />
          <Button
            label="Share Limits"
            variant="outline"
            onPress={() => setShareLimitsOpen(true)}
            icon={<Icon icon={Gauge} size={16} color="#a1a1aa" />}
            className="flex-1"
          />
        </View>
      </ScreenWrapper>

      <ShareLimitsSheet
        visible={shareLimitsOpen}
        onClose={() => setShareLimitsOpen(false)}
        hash={hash}
        ratioLimit={torrent.ratio_limit ?? -2}
        seedingTimeLimit={torrent.seeding_time_limit ?? -2}
      />

      <ActionSheet
        visible={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        onClosed={deferredBack.onClosed}
        title={torrent.name}
        subtitle="Remove this torrent from qBittorrent?"
        actions={[
          {
            label: "Delete",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runDelete(false),
          },
          {
            label: "Delete + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runDelete(true),
          },
        ]}
      />
    </>
  );
}

// Share-limit sentinels from qBittorrent: -2 = use global, -1 = no limit.
function formatRatioLimit(limit: number | undefined): string {
  if (limit === undefined || limit === -2) return "Global";
  if (limit === -1) return "Unlimited";
  return limit.toFixed(2);
}

function formatSeedTimeLimit(minutes: number | undefined): string {
  if (minutes === undefined || minutes === -2) return "Global";
  if (minutes === -1) return "Unlimited";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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
