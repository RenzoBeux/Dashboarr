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
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface CalendarSettingsValue extends Record<string, unknown> {
  // Independent per-service bindings — calendar can fan out across two
  // Sonarrs while pinning to one Radarr (or vice versa). Each side accepts
  // either the "all" sentinel or an array of instance UUIDs.
  sonarrInstanceIds: InstanceBindingValue;
  radarrInstanceIds: InstanceBindingValue;
  includeSonarr: boolean;
  includeRadarr: boolean;
  daysAhead: number;
  radarrReleaseType: "cinemas" | "digital" | "physical" | "any";
  hideWhenEmpty: boolean;
}

export const CALENDAR_DEFAULT_SETTINGS: CalendarSettingsValue = {
  sonarrInstanceIds: INSTANCE_BINDING_ALL,
  radarrInstanceIds: INSTANCE_BINDING_ALL,
  includeSonarr: true,
  includeRadarr: true,
  daysAhead: 7,
  // Default to "any" so movies show up regardless of which release Radarr
  // marks them with — matches how Radarr's calendar groups by default.
  radarrReleaseType: "any",
  hideWhenEmpty: false,
};

const DAYS_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

const RELEASE_TYPE_OPTIONS: {
  value: CalendarSettingsValue["radarrReleaseType"];
  label: string;
}[] = [
  { value: "any", label: "Any" },
  { value: "cinemas", label: "Cinemas" },
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Physical" },
];

export function CalendarSettings({ slotId }: WidgetSettingsComponentProps) {
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);
  const { settings, update } = useWidgetSettings<CalendarSettingsValue>(
    slotId,
    CALENDAR_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Sources">
        <ToggleCard>
          <Toggle
            label="Sonarr (TV episodes)"
            description={
              sonarrEnabled
                ? "Show upcoming episodes from monitored series"
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
                ? "Show upcoming movies on the Radarr calendar"
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
        label="Look ahead"
        options={DAYS_OPTIONS}
        value={settings.daysAhead}
        onChange={(daysAhead) => update({ daysAhead })}
      />

      {settings.includeRadarr && radarrEnabled && (
        <ChipGroup
          label="Movie release date"
          options={RELEASE_TYPE_OPTIONS}
          value={settings.radarrReleaseType}
          onChange={(radarrReleaseType) => update({ radarrReleaseType })}
        />
      )}

      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
