import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { MaxItemsSelector } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface RadarrQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
}

export const RADARR_QUEUE_DEFAULT_SETTINGS: RadarrQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
};

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
      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />
    </View>
  );
}
