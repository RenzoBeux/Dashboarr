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
  useSabQueue,
  useSabHistory,
  usePauseSabSlot,
  useResumeSabSlot,
  useDeleteSabSlot,
  useDeleteSabHistorySlot,
} from "@/hooks/use-sabnzbd";
import type { SabSlotStatus } from "@/lib/types";

function getBadgeVariant(
  status: SabSlotStatus,
): "downloading" | "seeding" | "paused" | "error" | "default" {
  if (status === "Paused") return "paused";
  if (status === "Failed") return "error";
  if (status === "Completed") return "seeding";
  if (status === "Queued") return "default";
  return "downloading";
}

export default function SabSlotDetailScreen() {
  // `instanceId` lands here from dashboard widget pushes (`/sab/<id>?instanceId=<uuid>`).
  // Omitted when the user navigates from the SAB tab, where it's implicit and
  // resolves to the active SAB instance.
  const { nzo_id, instanceId } = useLocalSearchParams<{
    nzo_id: string;
    instanceId?: string;
  }>();
  const {
    data: queue,
    isLoading: queueLoading,
    error: queueError,
  } = useSabQueue(instanceId);
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useSabHistory(50, instanceId);
  const pauseSlot = usePauseSabSlot(instanceId);
  const resumeSlot = useResumeSabSlot(instanceId);
  const deleteSlot = useDeleteSabSlot(instanceId);
  const deleteHistory = useDeleteSabHistorySlot(instanceId);
  const flow = useModalFlow<{ deleteSheet: void }>();

  const queueSlot = queue?.slots.find((s) => s.nzo_id === nzo_id);
  const historySlot = history?.slots.find((s) => s.nzo_id === nzo_id);

  if (!queueSlot && !historySlot) {
    // "Not found" only after both queue and history have actually resolved.
    // Otherwise we'd flash this message during the normal load that follows
    // navigation, which looks like a broken link.
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

  // Queue slot takes precedence — if a download is in both lists (which
  // shouldn't really happen) the active queue entry is more useful.
  const inQueue = !!queueSlot;
  const status: SabSlotStatus = inQueue ? queueSlot!.status : historySlot!.status;
  const name = inQueue ? queueSlot!.filename : historySlot!.name;
  const category = inQueue ? queueSlot!.cat : historySlot!.category;
  const progress = inQueue
    ? parseFloat(queueSlot!.percentage || "0") / 100
    : status === "Completed"
    ? 1
    : 0;
  const isPaused = status === "Paused";

  const runDelete = (deleteFiles: boolean) => {
    if (inQueue) {
      deleteSlot.mutate({ nzoId: nzo_id, deleteFiles });
    } else {
      deleteHistory.mutate({ nzoId: nzo_id, deleteFiles });
    }
    // flow.back() pops only once the sheet has fully dismissed.
    flow.back();
  };

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-lg font-bold mt-2 mb-1">{name}</Text>
      <Badge label={status} variant={getBadgeVariant(status)} className="self-start mb-4" />

      {/* Progress / Speed */}
      <Card className="mb-4">
        <ProgressBar progress={progress} showLabel className="mb-3" />
        <View className="flex-row justify-between">
          {inQueue && queue?.speed?.trim() && (
            <View className="flex-row items-center gap-1">
              <Icon icon={ArrowDown} size={14} color="#3b82f6" />
              <Text className="text-zinc-300 text-sm">{queue.speed}B/s</Text>
            </View>
          )}
          {inQueue && queueSlot!.timeleft && queueSlot!.timeleft !== "0:00:00" && (
            <View className="flex-row items-center gap-1">
              <Icon icon={Clock} size={14} color="#a1a1aa" />
              <Text className="text-zinc-300 text-sm">ETA {queueSlot!.timeleft}</Text>
            </View>
          )}
        </View>
      </Card>

      {/* Info */}
      <Card className="mb-4 gap-2">
        <InfoRow
          label="Size"
          value={inQueue ? queueSlot!.size : historySlot!.size}
        />
        {inQueue && (
          <InfoRow label="Remaining" value={queueSlot!.sizeleft} />
        )}
        {inQueue && (
          <InfoRow label="Priority" value={queueSlot!.priority} />
        )}
        <InfoRow label="Category" value={category || "—"} />
        {!inQueue && historySlot!.storage && (
          <InfoRow label="Storage" value={historySlot!.storage} />
        )}
        {!inQueue && historySlot!.fail_message && (
          <InfoRow label="Error" value={historySlot!.fail_message} />
        )}
        {!inQueue && historySlot!.completed > 0 && (
          <InfoRow
            label="Completed"
            value={new Date(historySlot!.completed * 1000).toLocaleString()}
          />
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
                ? resumeSlot.mutate(nzo_id)
                : pauseSlot.mutate(nzo_id)
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
