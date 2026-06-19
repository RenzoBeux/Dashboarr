import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { MaxItemsSelector } from "@/components/dashboard/widget-settings/widget-settings-blocks";
import type { ServiceId } from "@/lib/constants";

export interface ArrQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
}

export const ARR_QUEUE_DEFAULT_SETTINGS: ArrQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
};

interface Props extends WidgetSettingsComponentProps {
  serviceId: ServiceId;
}

// Shared settings for the *arr queue widgets (Radarr / Sonarr / Lidarr): pick
// which instances to aggregate and how many tiles to show. The per-service
// wrappers in their own files supply the serviceId.
export function ArrQueueSettings({ slotId, serviceId }: Props) {
  const { settings, update } = useWidgetSettings<ArrQueueSettingsValue>(
    slotId,
    ARR_QUEUE_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId={serviceId}
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
