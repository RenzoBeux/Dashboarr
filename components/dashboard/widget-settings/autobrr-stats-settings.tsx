import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { HideWhenEmptyToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface AutobrrStatsSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  hideWhenEmpty: boolean;
}

export const AUTOBRR_STATS_DEFAULT_SETTINGS: AutobrrStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hideWhenEmpty: false,
};

export function AutobrrStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<AutobrrStatsSettingsValue>(
    slotId,
    AUTOBRR_STATS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="autobrr"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
