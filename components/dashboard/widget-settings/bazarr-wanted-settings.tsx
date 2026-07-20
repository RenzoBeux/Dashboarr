import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { HideWhenEmptyToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface BazarrWantedSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  hideWhenEmpty: boolean;
}

export const BAZARR_WANTED_DEFAULT_SETTINGS: BazarrWantedSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hideWhenEmpty: false,
};

export function BazarrWantedSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<BazarrWantedSettingsValue>(
    slotId,
    BAZARR_WANTED_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="bazarr"
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
