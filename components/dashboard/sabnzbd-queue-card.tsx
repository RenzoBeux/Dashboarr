import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Pause, Play, CheckCircle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { getSabQueue, pauseSabSlot, resumeSabSlot } from "@/services/sabnzbd-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { truncateText } from "@/lib/utils";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  SABNZBD_QUEUE_DEFAULT_SETTINGS,
  type SabnzbdQueueSettingsValue,
  type SabnzbdQueueSortBy,
} from "@/components/dashboard/widget-settings/sabnzbd-queue-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { SabQueueSlot, SabSlotStatus } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type StateGroup = "downloading" | "paused" | "queued" | "other";

function classifyState(status: SabSlotStatus): StateGroup {
  if (status === "Paused") return "paused";
  if (status === "Queued") return "queued";
  if (
    status === "Downloading" ||
    status === "Grabbing" ||
    status === "Fetching" ||
    status === "Checking" ||
    status === "Verifying" ||
    status === "Repairing" ||
    status === "Extracting" ||
    status === "Moving"
  ) {
    return "downloading";
  }
  return "other";
}

function parseFloatSafe(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

interface TaggedSlot {
  slot: SabQueueSlot;
  instanceId: string;
}

function compareTagged(
  a: TaggedSlot,
  b: TaggedSlot,
  sortBy: SabnzbdQueueSortBy,
): number {
  switch (sortBy) {
    case "progress":
      return parseFloatSafe(b.slot.percentage) - parseFloatSafe(a.slot.percentage);
    case "name":
      return a.slot.filename.localeCompare(b.slot.filename);
    case "size":
      return parseFloatSafe(b.slot.mb) - parseFloatSafe(a.slot.mb);
    case "added":
      // SAB returns slots ordered oldest-first by index. Across instances we
      // can only sort by a per-instance index, so this is a stable-but-rough
      // approximation — newest within each instance bubble up first.
      return b.slot.index - a.slot.index;
  }
}

export function SabnzbdQueueCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<SabnzbdQueueSettingsValue>(
    slotId,
    SABNZBD_QUEUE_DEFAULT_SETTINGS,
  );

  const allInstances = useEnabledInstances("sabnzbd");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);

  const queueQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["sabnzbd", inst.id, "queue"] as const,
      queryFn: () => getSabQueue(inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queueQueries);

  const allowedGroups = new Set<StateGroup>();
  if (settings.showDownloading) allowedGroups.add("downloading");
  if (settings.showPaused) allowedGroups.add("paused");
  if (settings.showQueued) allowedGroups.add("queued");

  const allTagged: TaggedSlot[] = queueQueries.flatMap((q, i) =>
    (q.data?.slots ?? []).map((slot) => ({
      slot,
      instanceId: instances[i].id,
    })),
  );

  const filtered = allTagged
    .filter((t) => allowedGroups.has(classifyState(t.slot.status)))
    .sort((a, b) => compareTagged(a, b, settings.sortBy));

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;
  const allHidden = allowedGroups.size === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SABnzbd Queue</CardTitle>
        {filtered.length > 0 && (
          <Text className="text-zinc-500 text-sm">{filtered.length}</Text>
        )}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No SABnzbd instances enabled" />
      ) : allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={3} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} color="#71717a" />}
          title="Nothing to show"
        />
      ) : (
        <View className="gap-3">
          {display.map(({ slot, instanceId }) => (
            <SlotRow
              key={`${instanceId}:${slot.nzo_id}`}
              slot={slot}
              instanceId={instanceId}
              showInstanceName={instances.length > 1}
              instanceName={
                instances.find((i) => i.id === instanceId)?.name ?? ""
              }
              onPress={() => router.push(`/sab/${slot.nzo_id}?instanceId=${instanceId}`)}
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

interface SlotRowProps {
  slot: SabQueueSlot;
  instanceId: string;
  showInstanceName: boolean;
  instanceName: string;
  onPress: () => void;
}

function SlotRow({
  slot,
  instanceId,
  showInstanceName,
  instanceName,
  onPress,
}: SlotRowProps) {
  // Mutations are inlined here (not via the multi-instance hook) because the
  // hook's `useMutation` is bound at hook-call time; the row needs the slot's
  // own `instanceId`, which can differ across rows in the same card.
  const queryClient = useQueryClient();
  const pauseSlot = useMutation({
    mutationFn: (nzoId: string) => pauseSabSlot(nzoId, instanceId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", instanceId] }),
  });
  const resumeSlot = useMutation({
    mutationFn: (nzoId: string) => resumeSabSlot(nzoId, instanceId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", instanceId] }),
  });

  const isPaused = slot.status === "Paused";
  const progress = parseFloatSafe(slot.percentage) / 100;

  const handleToggle = () => {
    lightHaptic();
    if (isPaused) {
      resumeSlot.mutate(slot.nzo_id);
    } else {
      pauseSlot.mutate(slot.nzo_id);
    }
  };

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm" numberOfLines={1}>
            {truncateText(slot.filename, 40)}
          </Text>
          <ProgressBar progress={progress} showLabel className="mt-1.5" />
          <View className="flex-row gap-3 mt-1">
            <Text className="text-zinc-500 text-xs">{slot.size}</Text>
            {slot.timeleft && slot.timeleft !== "0:00:00" && (
              <Text className="text-zinc-500 text-xs">ETA {slot.timeleft}</Text>
            )}
            {slot.cat && (
              <Text className="text-zinc-500 text-xs">{slot.cat}</Text>
            )}
            {showInstanceName && (
              <Text className="text-zinc-500 text-xs">{instanceName}</Text>
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
