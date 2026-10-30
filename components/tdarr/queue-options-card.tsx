import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { toastError } from "@/components/ui/toast";
import { useTdarrGlobalSettings, useTdarrUpdateGlobalSettings } from "@/hooks/use-tdarr";
import { queueSortOptions, buildQueueTogglePatch } from "@/lib/tdarr-queue-options";
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
  const [expanded, setExpanded] = useState(false);
  // Only fetched (and polled) while the card is open.
  const { data: settings, isLoading } = useTdarrGlobalSettings(expanded);
  const update = useTdarrUpdateGlobalSettings();

  // The hook applies the patch optimistically and rolls it back on failure.
  // mutateAsync (not mutate's per-call callbacks, which TanStack only fires
  // for the latest call) so every write reports its own error.
  const apply = (patch: Partial<TdarrGlobalSettings>) => {
    update.mutateAsync(patch).catch((e) => toastError("Failed to update queue options", e));
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
            <Select
              label="Sort queue by"
              value={settings.queueSortType}
              options={queueSortOptions(settings.queueSortType)}
              onChange={(v) => apply({ queueSortType: v })}
              containerClassName="mb-2"
            />
            {TOGGLES.map((t) => (
              <Toggle
                key={t.key}
                label={t.label}
                description={t.hint}
                value={!!settings[t.key]}
                onValueChange={(on) => apply(buildQueueTogglePatch(t.key, on))}
              />
            ))}
            <Text className="text-zinc-500 text-xs mt-1">
              No Sort and disabling bumped files/prioritisation are fastest on large libraries.
            </Text>
          </View>
        ))}
    </Card>
  );
}
