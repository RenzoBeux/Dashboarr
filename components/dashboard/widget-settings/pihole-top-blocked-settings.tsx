import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  HideWhenEmptyToggle,
  MaxItemsSelector,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

// The shared default set starts at 3, which is too few to be a "top domains"
// list — a blocklist's tail is the interesting part.
const MAX_ITEM_OPTIONS = [
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
] as const;

export interface PiholeTopBlockedSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
  hideWhenEmpty: boolean;
}

export const PIHOLE_TOP_BLOCKED_DEFAULT_SETTINGS: PiholeTopBlockedSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
  hideWhenEmpty: false,
};

export function PiholeTopBlockedSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<PiholeTopBlockedSettingsValue>(
    slotId,
    PIHOLE_TOP_BLOCKED_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="pihole"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
        options={MAX_ITEM_OPTIONS}
      />
      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
