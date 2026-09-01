import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { AutoHideToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface PiholeStatusSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  /**
   * Inverted auto-hide: show the widget only when something is OFF. Its key is
   * registered in AUTO_HIDE_SETTING_KEYS so edit mode still marks the slot.
   */
  hideWhenBlockingEnabled: boolean;
}

export const PIHOLE_STATUS_DEFAULT_SETTINGS: PiholeStatusSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  hideWhenBlockingEnabled: false,
};

export function PiholeStatusSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<PiholeStatusSettingsValue>(
    slotId,
    PIHOLE_STATUS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="pihole"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <AutoHideToggle
        label="Hide while blocking is on"
        description="Only show this widget when blocking is disabled on at least one Pi-hole"
        value={settings.hideWhenBlockingEnabled}
        onChange={(hideWhenBlockingEnabled) => update({ hideWhenBlockingEnabled })}
      />
    </View>
  );
}
