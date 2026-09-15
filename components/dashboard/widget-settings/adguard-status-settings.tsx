import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { AutoHideToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface AdguardStatusSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  /**
   * Inverted auto-hide: show the widget only when something is OFF. Its key is
   * registered in AUTO_HIDE_SETTING_KEYS so edit mode still marks the slot.
   */
  hideWhenProtectionEnabled: boolean;
}

export const ADGUARD_STATUS_DEFAULT_SETTINGS: AdguardStatusSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hideWhenProtectionEnabled: false,
};

export function AdguardStatusSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<AdguardStatusSettingsValue>(
    slotId,
    ADGUARD_STATUS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="adguard"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <AutoHideToggle
        label="Hide while protection is on"
        description="Only show this widget when protection is disabled on at least one AdGuard Home"
        value={settings.hideWhenProtectionEnabled}
        onChange={(hideWhenProtectionEnabled) => update({ hideWhenProtectionEnabled })}
      />
    </View>
  );
}
