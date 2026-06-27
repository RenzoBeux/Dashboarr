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
import { ShareLimitsSheet } from "@/components/transmission/share-limits-sheet";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useTransmissionTorrent,
  useReannounceTransmissionTorrent,
} from "@/hooks/use-transmission";
import { transmissionTorrentAdapter } from "@/lib/torrent-adapters/transmission";
import { torrentBadgeVariant } from "@/lib/torrent-adapter";
import { formatBytes, formatSpeed, formatEta } from "@/lib/utils";

const ETA_UNKNOWN = 8640000;

export default function TransmissionDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const { data: detail, isLoading, error } = useTransmissionTorrent(hash);
  const pauseMutation = transmissionTorrentAdapter.usePauseTorrent();
  const resumeMutation = transmissionTorrentAdapter.useResumeTorrent();
  const deleteMutation = transmissionTorrentAdapter.useDeleteTorrent();
  const reannounceMutation = useReannounceTransmissionTorrent();
  const [shareLimitsOpen, setShareLimitsOpen] = useState(false);
  const flow = useModalFlow<{ deleteSheet: void }>();

  if (!detail) {
    return (
      <ScreenWrapper>
        <BackHeader />
        {error ? (
          <ErrorBanner error={error} title="Failed to load torrent" className="mt-4" />
        ) : isLoading ? (
          <View className="items-center justify-center mt-10">
            <ActivityIndicator color="#3b82f6" />
          </View>
        ) : (
          <Text className="text-zinc-400 text-center mt-10">Torrent not found</Text>
        )}
      </ScreenWrapper>
    );
  }

  const { torrent, files, trackers } = detail;
  const isPaused = torrent.status === "paused";

  const handleReannounce = () => {
    reannounceMutation.mutate([hash], {
      onSuccess: () => toast("Reannounce requested"),
      onError: (err) => toastError("Failed to reannounce", err),
    });
  };

  const runDelete = (deleteFiles: boolean) => {
    deleteMutation.mutate({ hashes: [hash], deleteFiles });
    // Optimistic pop — leave without waiting for the delete to resolve.
    flow.back();
  };

  return (
    <>
      <ScreenWrapper>
        <BackHeader />
        {/* Header */}
        <Text className="text-zinc-100 text-lg font-bold mb-1">{torrent.name}</Text>
        <Badge
          label={torrent.statusLabel}
          variant={torrentBadgeVariant(torrent.status)}
          className="self-start mb-4"
        />

        {/* Progress */}
        <Card className="mb-4">
          <ProgressBar progress={torrent.progress} showLabel className="mb-3" />
          <View className="flex-row justify-between">
            <View className="flex-row items-center gap-1">
              <Icon icon={ArrowDown} size={14} color="#3b82f6" />
              <Text className="text-zinc-300 text-sm">{formatSpeed(torrent.dlSpeed)}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon icon={ArrowUp} size={14} color="#22c55e" />
              <Text className="text-zinc-300 text-sm">{formatSpeed(torrent.upSpeed)}</Text>
            </View>
            {torrent.eta > 0 && torrent.eta < ETA_UNKNOWN && (
              <Text className="text-zinc-400 text-sm">ETA {formatEta(torrent.eta)}</Text>
            )}
          </View>
        </Card>

        {/* Info */}
        <Card className="mb-4 gap-2">
          <InfoRow label="Size" value={formatBytes(torrent.sizeBytes)} />
          <InfoRow label="Downloaded" value={formatBytes(torrent.downloaded)} />
          <InfoRow label="Uploaded" value={formatBytes(torrent.uploaded)} />
          <InfoRow label="Ratio" value={torrent.ratio.toFixed(2)} />
          {torrent.label ? <InfoRow label="Label" value={torrent.label} /> : null}
          <InfoRow label="Save Path" value={torrent.savePath} />
          {torrent.errorMessage ? (
            <InfoRow label="Error" value={torrent.errorMessage} />
          ) : null}
        </Card>

        {/* Files */}
        {files.length > 0 && (
          <Card className="mb-4">
            <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
              Files ({files.length})
            </Text>
            {files.slice(0, 10).map((file, i) => (
              <View key={`${file.name}:${i}`} className="py-1.5 border-b border-border/50">
                <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                  {file.name}
                </Text>
                <Text className="text-zinc-500 text-xs">
                  {formatBytes(file.length)} —{" "}
                  {file.length > 0
                    ? Math.round((file.bytesCompleted / file.length) * 100)
                    : 0}
                  %
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

        {/* Trackers */}
        {trackers.length > 0 && (
          <Card className="mb-4">
            <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
              Trackers ({trackers.length})
            </Text>
            {trackers.slice(0, 10).map((t, i) => (
              <View key={`${t.announce}:${i}`} className="py-1.5 border-b border-border/50">
                <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                  {t.host || t.announce}
                </Text>
                {t.lastAnnounceResult ||
                t.seederCount !== undefined ||
                t.leecherCount !== undefined ? (
                  <Text className="text-zinc-500 text-xs">
                    {t.seederCount !== undefined ? `S: ${t.seederCount}` : ""}
                    {t.leecherCount !== undefined ? `  L: ${t.leecherCount}` : ""}
                    {t.lastAnnounceResult ? `  ${t.lastAnnounceResult}` : ""}
                  </Text>
                ) : null}
              </View>
            ))}
            {trackers.length > 10 && (
              <Text className="text-zinc-500 text-xs mt-2">
                +{trackers.length - 10} more trackers
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
              isPaused ? resumeMutation.mutate([hash]) : pauseMutation.mutate([hash])
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
            onPress={() => flow.open("deleteSheet")}
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
        ratioMode={detail.seedRatioMode}
        ratioLimit={detail.seedRatioLimit}
        idleMode={detail.seedIdleMode}
        idleLimit={detail.seedIdleLimit}
      />

      <ActionSheet
        {...flow.bind("deleteSheet")}
        title={torrent.name}
        subtitle="Remove this torrent from Transmission?"
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-zinc-500 text-sm">{label}</Text>
      <Text className="text-zinc-300 text-sm flex-1 text-right ml-4" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
