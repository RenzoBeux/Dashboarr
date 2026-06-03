import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { MaxItemsSelector } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface LidarrQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
}

export const LIDARR_QUEUE_DEFAULT_SETTINGS: LidarrQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
};

export function LidarrQueueSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<LidarrQueueSettingsValue>(
    slotId,
    LIDARR_QUEUE_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="lidarr"
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
