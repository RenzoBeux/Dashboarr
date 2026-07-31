import { View } from "react-native";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import { AutoHideToggle } from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface ArrHealthSettingsValue extends Record<string, unknown> {
  // Health Alerts' take on "hide when empty" (#303). The card is never blank —
  // with nothing wrong it renders a reassuring "All services healthy" row — so
  // the useful signal is the absence of alerts: hide while every *arr instance
  // reports clean, reappear the moment one raises a warning or error. Shares
  // the Services widget's key so `slotAutoHides` marks the slot in edit mode.
  hideWhenAllHealthy: boolean;
}

export const ARR_HEALTH_DEFAULT_SETTINGS: ArrHealthSettingsValue = {
  hideWhenAllHealthy: false,
};

export function ArrHealthSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<ArrHealthSettingsValue>(
    slotId,
    ARR_HEALTH_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <AutoHideToggle
        label="Hide when all healthy"
        description="Hide this widget from the dashboard when Sonarr, Radarr, Prowlarr and Lidarr report no health issues"
        value={settings.hideWhenAllHealthy}
        onChange={(hideWhenAllHealthy) => update({ hideWhenAllHealthy })}
      />
    </View>
  );
}
