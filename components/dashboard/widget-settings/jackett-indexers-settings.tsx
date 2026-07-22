import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { HideWhenEmptyToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface JackettIndexersSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  hideWhenEmpty: boolean;
}

export const JACKETT_INDEXERS_DEFAULT_SETTINGS: JackettIndexersSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hideWhenEmpty: false,
};

export function JackettIndexersSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<JackettIndexersSettingsValue>(
    slotId,
    JACKETT_INDEXERS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="jackett"
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
