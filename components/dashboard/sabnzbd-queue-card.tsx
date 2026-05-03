import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play, CheckCircle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useSabQueue,
  usePauseSabSlot,
  useResumeSabSlot,
} from "@/hooks/use-sabnzbd";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { truncateText } from "@/lib/utils";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  SABNZBD_QUEUE_DEFAULT_SETTINGS,
  type SabnzbdQueueSettingsValue,
  type SabnzbdQueueSortBy,
} from "@/components/dashboard/widget-settings/sabnzbd-queue-settings";
import type { SabQueueSlot, SabSlotStatus } from "@/lib/types";

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

function compareSlots(a: SabQueueSlot, b: SabQueueSlot, sortBy: SabnzbdQueueSortBy): number {
  switch (sortBy) {
    case "progress":
      return parseFloatSafe(b.percentage) - parseFloatSafe(a.percentage);
    case "name":
      return a.filename.localeCompare(b.filename);
    case "size":
      return parseFloatSafe(b.mb) - parseFloatSafe(a.mb);
    case "added":
      // SAB returns slots ordered oldest-first by index, so flipping the
      // comparator surfaces the most recently added jobs.
      return b.index - a.index;
  }
}

export function SabnzbdQueueCard() {
  const { settings } = useWidgetSettings<SabnzbdQueueSettingsValue>(
    "sabnzbd-queue",
    SABNZBD_QUEUE_DEFAULT_SETTINGS,
  );
  const { data: queue, isLoading } = useSabQueue();
  const router = useRouter();

  const allowedGroups = new Set<StateGroup>();
  if (settings.showDownloading) allowedGroups.add("downloading");
  if (settings.showPaused) allowedGroups.add("paused");
  if (settings.showQueued) allowedGroups.add("queued");

  const filtered = (queue?.slots ?? [])
    .filter((s) => allowedGroups.has(classifyState(s.status)))
    .sort((a, b) => compareSlots(a, b, settings.sortBy));

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

      {allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} color="#71717a" />}
          title="Nothing to show"
        />
      ) : (
        <View className="gap-3">
          {display.map((slot) => (
            <SlotRow
              key={slot.nzo_id}
              slot={slot}
              onPress={() => router.push(`/sab/${slot.nzo_id}`)}
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

function SlotRow({ slot, onPress }: { slot: SabQueueSlot; onPress: () => void }) {
  const pauseSlot = usePauseSabSlot();
  const resumeSlot = useResumeSabSlot();

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
