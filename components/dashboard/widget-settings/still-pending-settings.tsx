import { View } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { useConfigStore } from "@/store/config-store";
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
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface StillPendingSettingsValue extends Record<string, unknown> {
  // Independent per-service bindings, same shape as the calendar widget.
  sonarrInstanceIds: InstanceBindingValue;
  radarrInstanceIds: InstanceBindingValue;
  includeSonarr: boolean;
  includeRadarr: boolean;
  lookbackDays: number;
  maxItems: number;
  // When on, items dated today that have already aired/released are included
  // too (they also appear under "Today" in the Releasing Soon widget). Off by
  // default so the two cards never list the same item.
  includeToday: boolean;
  hideWhenEmpty: boolean;
}

export const STILL_PENDING_DEFAULT_SETTINGS: StillPendingSettingsValue = {
  sonarrInstanceIds: INSTANCE_BINDING_ALL,
  radarrInstanceIds: INSTANCE_BINDING_ALL,
  includeSonarr: true,
  includeRadarr: true,
  // "Recently due" window — the full missing backlog already lives in the
  // Movies Wanted tab; this widget is about catching what just slipped by.
  lookbackDays: 14,
  maxItems: 5,
  includeToday: false,
  hideWhenEmpty: false,
};

const LOOKBACK_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export function StillPendingSettings({ slotId }: WidgetSettingsComponentProps) {
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);
  const { settings, update } = useWidgetSettings<StillPendingSettingsValue>(
    slotId,
    STILL_PENDING_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Sources">
        <ToggleCard>
          <Toggle
            label="Sonarr (TV episodes)"
            description={
              sonarrEnabled
                ? "Show aired episodes that haven't downloaded"
                : "Enable Sonarr in Settings to use this source"
            }
            value={settings.includeSonarr && sonarrEnabled}
            onValueChange={(includeSonarr) => update({ includeSonarr })}
            disabled={!sonarrEnabled}
          />
          <Toggle
            label="Radarr (movies)"
            description={
              radarrEnabled
                ? "Show released movies that haven't downloaded"
                : "Enable Radarr in Settings to use this source"
            }
            value={settings.includeRadarr && radarrEnabled}
            onValueChange={(includeRadarr) => update({ includeRadarr })}
            disabled={!radarrEnabled}
          />
        </ToggleCard>
      </SettingsSection>

      {settings.includeSonarr && sonarrEnabled && (
        <InstancePickerRow
          serviceId="sonarr"
          label="Sonarr instance"
          value={settings.sonarrInstanceIds}
          onChange={(sonarrInstanceIds) => update({ sonarrInstanceIds })}
        />
      )}

      {settings.includeRadarr && radarrEnabled && (
        <InstancePickerRow
          serviceId="radarr"
          label="Radarr instance"
          value={settings.radarrInstanceIds}
          onChange={(radarrInstanceIds) => update({ radarrInstanceIds })}
        />
      )}

      <ChipGroup
        label="Look back"
        options={LOOKBACK_OPTIONS}
        value={settings.lookbackDays}
        onChange={(lookbackDays) => update({ lookbackDays })}
      />

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />

      <SettingsSection label="Options">
        <ToggleCard>
          <Toggle
            label="Include today"
            description="Also show items already aired or released today — these are listed in Releasing Soon too"
            value={settings.includeToday}
            onValueChange={(includeToday) => update({ includeToday })}
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
