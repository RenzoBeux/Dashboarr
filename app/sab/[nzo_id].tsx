import { View, Text, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pause, Play, Trash2, ArrowDown, Clock } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const { data: queue } = useSabQueue(instanceId);
  const { data: history } = useSabHistory(50, instanceId);
  const pauseSlot = usePauseSabSlot(instanceId);
  const resumeSlot = useResumeSabSlot(instanceId);
  const deleteSlot = useDeleteSabSlot(instanceId);
  const deleteHistory = useDeleteSabHistorySlot(instanceId);

  const queueSlot = queue?.slots.find((s) => s.nzo_id === nzo_id);
  const historySlot = history?.slots.find((s) => s.nzo_id === nzo_id);

  if (!queueSlot && !historySlot) {
    return (
      <ScreenWrapper>
        <Text className="text-zinc-400 text-center mt-10">Download not found</Text>
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

  const handleDelete = () => {
    Alert.alert("Delete Download", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (inQueue) {
            deleteSlot.mutate({ nzoId: nzo_id });
          } else {
            deleteHistory.mutate({ nzoId: nzo_id });
          }
          router.back();
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          if (inQueue) {
            deleteSlot.mutate({ nzoId: nzo_id, deleteFiles: true });
          } else {
            deleteHistory.mutate({ nzoId: nzo_id, deleteFiles: true });
          }
          router.back();
        },
      },
    ]);
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
          onPress={handleDelete}
          loading={deleteSlot.isPending || deleteHistory.isPending}
          icon={<Icon icon={Trash2} size={16} color="white" />}
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
      <Text className="text-zinc-300 text-sm flex-1 text-right ml-4" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
