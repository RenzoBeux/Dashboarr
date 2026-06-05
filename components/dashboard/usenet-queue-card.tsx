import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Pause, Play, CheckCircle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { truncateText } from "@/lib/utils";
import {
  USENET_QUEUE_DEFAULT_SETTINGS,
  type UsenetQueueSettingsValue,
  type UsenetQueueSortBy,
} from "@/components/dashboard/widget-settings/usenet-queue-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { UnifiedItem, UsenetAdapter } from "@/lib/usenet-adapter";

interface TaggedItem {
  item: UnifiedItem;
  instanceId: string;
}

function compareTagged(
  a: TaggedItem,
  b: TaggedItem,
  sortBy: UsenetQueueSortBy,
): number {
  switch (sortBy) {
    case "progress":
      return b.item.progress - a.item.progress;
    case "name":
      return a.item.name.localeCompare(b.item.name);
    case "size":
      return b.item.bytes - a.item.bytes;
    case "added":
      // Per-instance index — across instances this is stable-but-rough.
      return b.item.index - a.item.index;
  }
}

interface Props extends WidgetComponentProps {
  adapter: UsenetAdapter;
}

export function UsenetQueueCard({ slotId, adapter }: Props) {
  const router = useRouter();
  const { settings } = useWidgetSettings<UsenetQueueSettingsValue>(
    slotId,
    USENET_QUEUE_DEFAULT_SETTINGS,
  );

  const instances = useWorkspaceScopedInstances(
    adapter.serviceId,
    settings.instanceIds,
  );

  const queueQueries = useQueries({
    queries: instances.map((inst) => adapter.queueQueryOptions(inst.id)),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queueQueries);

  const allowedStatuses = new Set<UnifiedItem["status"]>();
  if (settings.showDownloading) allowedStatuses.add("downloading");
  if (settings.showPaused) allowedStatuses.add("paused");
  if (settings.showQueued) allowedStatuses.add("queued");

  const allTagged: TaggedItem[] = queueQueries.flatMap((q, i) =>
    (q.data?.items ?? []).map((item) => ({
      item,
      instanceId: instances[i].id,
    })),
  );

  const filtered = allTagged
    .filter((t) => allowedStatuses.has(t.item.status))
    .sort((a, b) => compareTagged(a, b, settings.sortBy));

  const display = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;
  const allHidden = allowedStatuses.size === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{adapter.displayName} Queue</CardTitle>
        {filtered.length > 0 && (
          <Text className="text-zinc-500 text-sm">{filtered.length}</Text>
        )}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title={`No ${adapter.displayName} instances enabled`} />
      ) : allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={3} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<Icon icon={CheckCircle} size={32} color="#71717a" />}
          title="Nothing to show"
        />
      ) : (
        <View className="gap-3">
          {display.map(({ item, instanceId }) => (
            <SlotRow
              key={`${instanceId}:${item.id}`}
              item={item}
              instanceId={instanceId}
              adapter={adapter}
              showInstanceName={instances.length > 1}
              instanceName={
                instances.find((i) => i.id === instanceId)?.name ?? ""
              }
              onPress={() => router.push(adapter.detailRoute(item.id, instanceId))}
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
  item: UnifiedItem;
  instanceId: string;
  adapter: UsenetAdapter;
  showInstanceName: boolean;
  instanceName: string;
  onPress: () => void;
}

function SlotRow({
  item,
  instanceId,
  adapter,
  showInstanceName,
  instanceName,
  onPress,
}: SlotRowProps) {
  // Mutations are bound per-row (not per-card) because each row may belong to
  // a different instance — the card aggregates across all enabled instances.
  const pauseSlot = adapter.usePauseSlot(instanceId);
  const resumeSlot = adapter.useResumeSlot(instanceId);

  const isPaused = item.status === "paused";

  const handleToggle = () => {
    lightHaptic();
    if (isPaused) {
      resumeSlot.mutate(item.id);
    } else {
      pauseSlot.mutate(item.id);
    }
  };

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm" numberOfLines={1}>
            {truncateText(item.name, 40)}
          </Text>
          <ProgressBar progress={item.progress} showLabel className="mt-1.5" />
          <View className="flex-row gap-3 mt-1">
            <Text className="text-zinc-500 text-xs">{item.sizeLabel}</Text>
            {item.timeleft && item.timeleft !== "0:00:00" && (
              <Text className="text-zinc-500 text-xs">ETA {item.timeleft}</Text>
            )}
            {item.category && (
              <Text className="text-zinc-500 text-xs">{item.category}</Text>
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
            <Icon icon={Play} size={20} color="#3b82f6" />
          ) : (
            <Icon icon={Pause} size={20} color="#f59e0b" />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}
