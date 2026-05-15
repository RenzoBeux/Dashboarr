import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import type { ServiceId } from "@/lib/constants";

export type UsenetQueueSortBy = "progress" | "name" | "size" | "added";

export interface UsenetQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
  showDownloading: boolean;
  showPaused: boolean;
  showQueued: boolean;
  sortBy: UsenetQueueSortBy;
}

export const USENET_QUEUE_DEFAULT_SETTINGS: UsenetQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
  showDownloading: true,
  showPaused: true,
  showQueued: true,
  sortBy: "progress",
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

const SORT_OPTIONS: { value: UsenetQueueSortBy; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "size", label: "Size" },
  { value: "name", label: "Name" },
  { value: "added", label: "Recent" },
];

interface Props extends WidgetSettingsComponentProps {
  serviceId: ServiceId;
}

export function UsenetQueueSettings({ slotId, serviceId }: Props) {
  const { settings, update } = useWidgetSettings<UsenetQueueSettingsValue>(
    slotId,
    USENET_QUEUE_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId={serviceId}
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Show states
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
          <Toggle
            label="Downloading"
            description="In-progress, grabbing, verifying"
            value={settings.showDownloading}
            onValueChange={(showDownloading) => update({ showDownloading })}
          />
          <Toggle
            label="Paused"
            value={settings.showPaused}
            onValueChange={(showPaused) => update({ showPaused })}
          />
          <Toggle
            label="Queued"
            value={settings.showQueued}
            onValueChange={(showQueued) => update({ showQueued })}
          />
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Max items
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {MAX_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.maxItems === option.value}
              onPress={() => update({ maxItems: option.value })}
            />
          ))}
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Sort by
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.sortBy === option.value}
              onPress={() => update({ sortBy: option.value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
