import { View } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  HideWhenEmptyToggle,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface NavidromeLibrarySettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  showMissing: boolean;
  hideWhenEmpty: boolean;
}

export const NAVIDROME_LIBRARY_DEFAULT_SETTINGS: NavidromeLibrarySettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  showMissing: true,
  hideWhenEmpty: false,
};

export function NavidromeLibrarySettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<NavidromeLibrarySettingsValue>(
    slotId,
    NAVIDROME_LIBRARY_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="navidrome"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <SettingsSection label="Show">
        <ToggleCard>
          <Toggle
            label="Missing files"
            description="Tracks Navidrome can no longer find on disk. Only reported for admin accounts."
            value={settings.showMissing}
            onValueChange={(showMissing) => update({ showMissing })}
          />
        </ToggleCard>
      </SettingsSection>
      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
