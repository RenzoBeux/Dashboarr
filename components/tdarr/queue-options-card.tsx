import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { View, Text, Pressable, Switch } from "react-native";
import { SlidersHorizontal, ChevronDown, ChevronUp, ChevronRight, Check } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionSheet } from "@/components/ui/action-sheet";
import { toastError } from "@/components/ui/toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useTdarrGlobalSettings, useTdarrUpdateGlobalSettings } from "@/hooks/use-tdarr";
import { TDARR_QUEUE_SORTS, queueSortLabel, buildQueueTogglePatch } from "@/lib/tdarr-queue-options";
import { lightHaptic } from "@/lib/haptics";
import type { TdarrGlobalSettings, TdarrQueueToggleKey } from "@/lib/types";

const TOGGLES: { key: TdarrQueueToggleKey; label: string; hint?: string }[] = [
  { key: "ignoreSchedules", label: "Ignore schedules" },
  { key: "enableBumpedFiles", label: "Enable bumped files", hint: "Process bumped files before others" },
  { key: "alternateLibraries", label: "Library alternation" },
  { key: "prioritiseLibraries", label: "Library prioritisation" },
  { key: "prioritiseTranscodes", label: "Prioritise transcodes" },
  { key: "prioritiseHealthChecks", label: "Prioritise health checks" },
];

export function QueueOptionsCard() {
  const tc = useThemeColor();
  const { data, isLoading } = useTdarrGlobalSettings();
  const update = useTdarrUpdateGlobalSettings();
  const [expanded, setExpanded] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  // Optimistic overlay so a switch doesn't snap back while the write and the
  // refetch are in flight; cleared once the mutation settles.
  const [optimistic, setOptimistic] = useState<Partial<TdarrGlobalSettings>>({});

  const settings = data ? { ...data, ...optimistic } : undefined;

  const queryClient = useQueryClient();
  const { instanceId } = useInstanceTarget("tdarr");
  const pending = useRef(0);

  const apply = async (patch: Partial<TdarrGlobalSettings>) => {
    lightHaptic();
    pending.current += 1;
    setOptimistic((o) => ({ ...o, ...patch }));
    try {
      // mutateAsync (not mutate's per-call callbacks, which TanStack only fires
      // for the latest call) so every write settles and reports its own error.
      await update.mutateAsync(patch);
    } catch (e) {
      toastError("Failed to update queue options", e);
    } finally {
      pending.current -= 1;
      if (pending.current === 0) {
        // The mutation settles before the invalidation refetch lands, so wait
        // for a fresh read before dropping the overlay.
        try {
          await queryClient.refetchQueries({ queryKey: ["tdarr", instanceId, "global-settings"] });
        } catch {}
        if (pending.current === 0) setOptimistic({});
      }
    }
  };

  return (
    <Card>
      <Pressable
        onPress={() => { lightHaptic(); setExpanded((e) => !e); }}
        className="active:opacity-70"
      >
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <Icon icon={SlidersHorizontal} size={18} color="#a1a1aa" />
            <CardTitle>Queue Options</CardTitle>
          </View>
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} color="#71717a" />
        </CardHeader>
      </Pressable>
      {expanded &&
        (isLoading ? (
          <SkeletonCardContent rows={3} />
        ) : !settings ? (
          <EmptyState title="Settings unavailable" />
        ) : (
          <View className="gap-1">
            <Pressable
              onPress={() => { lightHaptic(); setSortOpen(true); }}
              className="flex-row items-center justify-between bg-surface-light rounded-lg px-3 py-2.5 active:opacity-70"
            >
              <Text className="text-zinc-200 text-sm flex-1 mr-2">Sort queue by</Text>
              <Text className="text-zinc-400 text-sm mr-1" numberOfLines={1}>
                {queueSortLabel(settings.queueSortType)}
              </Text>
              <Icon icon={ChevronRight} size={16} color="#71717a" />
            </Pressable>
            {TOGGLES.map((t) => {
              const value = !!settings[t.key];
              return (
                <View
                  key={t.key}
                  className="flex-row items-center justify-between bg-surface-light rounded-lg px-3 py-2"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-zinc-200 text-sm">{t.label}</Text>
                    {t.hint && <Text className="text-zinc-500 text-xs mt-0.5">{t.hint}</Text>}
                  </View>
                  <Switch
                    value={value}
                    onValueChange={(on) => apply(buildQueueTogglePatch(t.key, on))}
                    trackColor={{ false: tc("#3f3f46"), true: "#3b82f6" }}
                    thumbColor={value ? "#ffffff" : tc("#a1a1aa")}
                  />
                </View>
              );
            })}
            <Text className="text-zinc-500 text-xs mt-1">
              No Sort and disabling bumped files/prioritisation are fastest on large libraries.
            </Text>
          </View>
        ))}
      <ActionSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort queue by"
        actions={TDARR_QUEUE_SORTS.map((s) => ({
          label: s.label,
          icon:
            settings?.queueSortType === s.value ? (
              <Icon icon={Check} size={16} color="#3b82f6" />
            ) : undefined,
          onPress: () => apply({ queueSortType: s.value }),
        }))}
      />
    </Card>
  );
}
