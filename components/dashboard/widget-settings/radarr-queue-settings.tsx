import { View, Text } from "react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface RadarrQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
}

export const RADARR_QUEUE_DEFAULT_SETTINGS: RadarrQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

export function RadarrQueueSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<RadarrQueueSettingsValue>(
    slotId,
    RADARR_QUEUE_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="radarr"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
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
    </View>
  );
}
