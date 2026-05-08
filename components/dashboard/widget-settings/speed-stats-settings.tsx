import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface SpeedStatsSettingsValue extends Record<string, unknown> {
  // Which qBittorrent instances to graph. "all" sums every enabled instance's
  // speeds into one card; an array of UUIDs sums just those servers.
  instanceIds: InstanceBindingValue;
}

export const SPEED_STATS_DEFAULT_SETTINGS: SpeedStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
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
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
    </View>
  );
}
