import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface ProwlarrStatsSettingsValue extends Record<string, unknown> {
  instanceId: InstanceBindingValue;
}

export const PROWLARR_STATS_DEFAULT_SETTINGS: ProwlarrStatsSettingsValue = {
  instanceId: INSTANCE_BINDING_ALL,
};

export function ProwlarrStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<ProwlarrStatsSettingsValue>(
    slotId,
    PROWLARR_STATS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="prowlarr"
        value={settings.instanceId}
        onChange={(instanceId) => update({ instanceId })}
      />
    </View>
  );
}
