import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface SpeedStatsSettingsValue extends Record<string, unknown> {
  // Which qBittorrent instance to graph. "all" sums every enabled instance's
  // speeds into one card; a UUID pins to one server.
  instanceId: InstanceBindingValue;
}

export const SPEED_STATS_DEFAULT_SETTINGS: SpeedStatsSettingsValue = {
  instanceId: INSTANCE_BINDING_ALL,
};

export function SpeedStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="qbittorrent"
        value={settings.instanceId}
        onChange={(instanceId) => update({ instanceId })}
      />
    </View>
  );
}
