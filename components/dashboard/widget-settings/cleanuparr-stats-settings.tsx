import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  ChipGroup,
  HideWhenEmptyToggle,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

const TIMEFRAME_OPTIONS = [
  { value: 24, label: "24h" },
  { value: 72, label: "3d" },
  { value: 168, label: "7d" },
  { value: 720, label: "30d" },
] as const;

export interface CleanuparrStatsSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  hours: number;
  hideWhenEmpty: boolean;
}

export const CLEANUPARR_STATS_DEFAULT_SETTINGS: CleanuparrStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hours: 168,
  hideWhenEmpty: false,
};

export function CleanuparrStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<CleanuparrStatsSettingsValue>(
    slotId,
    CLEANUPARR_STATS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="cleanuparr"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <ChipGroup
        label="Timeframe"
        options={TIMEFRAME_OPTIONS}
        value={settings.hours}
        onChange={(hours) => update({ hours })}
      />
      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
