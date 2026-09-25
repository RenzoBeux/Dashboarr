import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface BeszelSystemsSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
}

export const BESZEL_SYSTEMS_DEFAULT_SETTINGS: BeszelSystemsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
};

export function BeszelSystemsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<BeszelSystemsSettingsValue>(
    slotId,
    BESZEL_SYSTEMS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="beszel"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
    </View>
  );
}
