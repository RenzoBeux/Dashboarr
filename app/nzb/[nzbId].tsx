import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Pause, Play, Trash2, ArrowDown, Clock } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ErrorBanner } from "@/components/common/error-banner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { ActionSheet } from "@/components/ui/action-sheet";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useDeleteNzbgetGroup,
  useDeleteNzbgetHistorySlot,
  useNzbgetGroups,
  useNzbgetHistory,
  useNzbgetStatus,
  usePauseNzbgetGroup,
  useResumeNzbgetGroup,
} from "@/hooks/use-nzbget";
import { combineHiLo, formatBytes, formatEta, formatSpeed } from "@/lib/utils";
import { usenetBadgeVariant } from "@/lib/usenet-adapter";
import type { UsenetStatus } from "@/lib/usenet-adapter";
import type { NzbgetGroupStatus } from "@/lib/types";

function classifyGroupStatus(status: NzbgetGroupStatus): UsenetStatus {
  switch (status) {
    case "PAUSED":
      return "paused";
    case "QUEUED":
    case "PP_QUEUED":
      return "queued";
    case "DOWNLOADING":
    case "FETCHING":
    case "PARSING":
    case "REPAIRING":
    case "UNPACKING":
    case "MOVING":
    case "VERIFYING":
    case "RENAMING":
    case "DELETING":
      return "downloading";
    default:
      return "other";
  }
}

function classifyHistoryStatus(rawStatus: string): UsenetStatus {
  const head = rawStatus.split("/")[0];
  if (head === "SUCCESS") return "completed";
  if (head === "FAILURE") return "failed";
  if (head === "WARNING") return "completed";
  return "other";
}

export default function NzbgetSlotDetailScreen() {
  // `instanceId` lands here from dashboard widget pushes (`/nzb/<id>?instanceId=<uuid>`).
  // Omitted when the user navigates from the Downloads tab, where it resolves
  // to the active NZBGet instance.
  const { nzbId, instanceId } = useLocalSearchParams<{
    nzbId: string;
    instanceId?: string;
  }>();
  const numericId = Number(nzbId);

  const {
    data: groups,
    isLoading: queueLoading,
    error: queueError,
  } = useNzbgetGroups(instanceId);
  const {
    data: historyItems,
    isLoading: historyLoading,
    error: historyError,
  } = useNzbgetHistory(50, instanceId);
  const { data: status } = useNzbgetStatus(instanceId);
  const pauseSlot = usePauseNzbgetGroup(instanceId);
  const resumeSlot = useResumeNzbgetGroup(instanceId);
  const deleteSlot = useDeleteNzbgetGroup(instanceId);
  const deleteHistory = useDeleteNzbgetHistorySlot(instanceId);
  const flow = useModalFlow<{ deleteSheet: void }>();

  const queueGroup = groups?.find((g) => g.NZBID === numericId);
  const historyItem = historyItems?.find((h) => h.NZBID === numericId);

  if (!queueGroup && !historyItem) {
    const fetchError = queueError ?? historyError;
    const stillLoading = !fetchError && (queueLoading || historyLoading);
    return (
      <ScreenWrapper>
        {fetchError ? (
          <ErrorBanner
            error={fetchError}
            title="Failed to load download"
            className="mt-4"
          />
        ) : stillLoading ? (
          <View className="items-center justify-center mt-10">
            <ActivityIndicator color="#3b82f6" />
          </View>
        ) : (
          <Text className="text-zinc-400 text-center mt-10">Download not found</Text>
        )}
      </ScreenWrapper>
    );
  }

  const inQueue = !!queueGroup;
  const rawStatus = inQueue ? queueGroup!.Status : historyItem!.Status;
  const normalizedStatus = inQueue
    ? classifyGroupStatus(queueGroup!.Status)
    : classifyHistoryStatus(historyItem!.Status);
  const name = inQueue ? queueGroup!.NZBName : historyItem!.NZBName;
  const category = inQueue ? queueGroup!.Category : historyItem!.Category;
  const totalBytes = combineHiLo(
    inQueue ? queueGroup!.FileSizeHi : historyItem!.FileSizeHi,
    inQueue ? queueGroup!.FileSizeLo : historyItem!.FileSizeLo,
  );
  const remainingBytes = inQueue
    ? combineHiLo(queueGroup!.RemainingSizeHi, queueGroup!.RemainingSizeLo)
    : 0;
  const downloadedBytes = totalBytes - remainingBytes;
  const progress = inQueue
    ? totalBytes > 0
      ? Math.max(0, Math.min(1, downloadedBytes / totalBytes))
      : 0
    : normalizedStatus === "completed"
      ? 1
      : 0;
  const isPaused = normalizedStatus === "paused";
  const overallSpeed = status?.DownloadRate ?? 0;
  const eta =
    inQueue && overallSpeed > 0 && remainingBytes > 0
      ? formatEta(Math.round(remainingBytes / overallSpeed))
      : undefined;

  const runDelete = (deleteFiles: boolean) => {
    if (inQueue) {
      deleteSlot.mutate({ nzbId: numericId, deleteFiles });
    } else {
      deleteHistory.mutate({ nzbId: numericId, deleteFiles });
    }
    // Optimistic pop — flow.back() waits until the sheet is fully dismissed.
    flow.back();
  };

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-lg font-bold mt-2 mb-1">{name}</Text>
      <Badge
        label={rawStatus}
        variant={usenetBadgeVariant(normalizedStatus)}
        className="self-start mb-4"
      />

      {/* Progress / Speed */}
      <Card className="mb-4">
        <ProgressBar progress={progress} showLabel className="mb-3" />
        <View className="flex-row justify-between">
          {inQueue && overallSpeed > 0 && (
            <View className="flex-row items-center gap-1">
              <Icon icon={ArrowDown} size={14} color="#3b82f6" />
              <Text className="text-zinc-300 text-sm">{formatSpeed(overallSpeed)}</Text>
            </View>
          )}
          {inQueue && eta && (
            <View className="flex-row items-center gap-1">
              <Icon icon={Clock} size={14} color="#a1a1aa" />
              <Text className="text-zinc-300 text-sm">ETA {eta}</Text>
            </View>
          )}
        </View>
      </Card>

      {/* Info */}
      <Card className="mb-4 gap-2">
        <InfoRow label="Size" value={formatBytes(totalBytes)} />
        {inQueue && (
          <InfoRow label="Remaining" value={formatBytes(remainingBytes)} />
        )}
        {inQueue && (
          <InfoRow label="Priority" value={String(queueGroup!.Priority)} />
        )}
        <InfoRow label="Category" value={category || "—"} />
        {!inQueue && historyItem!.HistoryTime > 0 && (
          <InfoRow
            label="Completed"
            value={new Date(historyItem!.HistoryTime * 1000).toLocaleString()}
          />
        )}
        {!inQueue && historyItem!.ScriptStatus && (
          <InfoRow label="Script" value={historyItem!.ScriptStatus} />
        )}
      </Card>

      {/* Actions */}
      <View className="flex-row gap-3">
        {inQueue && (
          <Button
            label={isPaused ? "Resume" : "Pause"}
            variant="outline"
            onPress={() =>
              isPaused
                ? resumeSlot.mutate(numericId)
                : pauseSlot.mutate(numericId)
            }
            loading={pauseSlot.isPending || resumeSlot.isPending}
            icon={
              isPaused ? (
                <Icon icon={Play} size={16} color="#3b82f6" />
              ) : (
                <Icon icon={Pause} size={16} color="#f59e0b" />
              )
            }
            className="flex-1"
          />
        )}
        <Button
          label="Delete"
          variant="danger"
          onPress={() => flow.open("deleteSheet")}
          loading={deleteSlot.isPending || deleteHistory.isPending}
          icon={<Icon icon={Trash2} size={16} color="white" />}
          className="flex-1"
        />
      </View>

      <ActionSheet
        {...flow.bind("deleteSheet")}
        title={name}
        subtitle="Delete this download?"
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
    </ScreenWrapper>
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
