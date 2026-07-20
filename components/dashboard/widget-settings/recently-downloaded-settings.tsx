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
  HideWhenEmptyToggle,
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface RecentlyDownloadedSettingsValue extends Record<string, unknown> {
  // Per-service bindings so users can fan out across two Sonarrs while
  // pinning to one Radarr (mirrors the Calendar widget). Each side accepts
  // either the "all" sentinel or an array of instance UUIDs.
  sonarrInstanceIds: InstanceBindingValue;
  radarrInstanceIds: InstanceBindingValue;
  includeSonarr: boolean;
  includeRadarr: boolean;
  maxItems: number;
  hideWhenEmpty: boolean;
}

export const RECENTLY_DOWNLOADED_DEFAULT_SETTINGS: RecentlyDownloadedSettingsValue = {
  sonarrInstanceIds: INSTANCE_BINDING_ALL,
  radarrInstanceIds: INSTANCE_BINDING_ALL,
  includeSonarr: true,
  includeRadarr: true,
  maxItems: 10,
  hideWhenEmpty: false,
};

export function RecentlyDownloadedSettings({ slotId }: WidgetSettingsComponentProps) {
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);
  const { settings, update } = useWidgetSettings<RecentlyDownloadedSettingsValue>(
    slotId,
    RECENTLY_DOWNLOADED_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Sources">
        <ToggleCard>
          <Toggle
            label="Sonarr (TV episodes)"
            description={
              sonarrEnabled
                ? "Show recently imported episodes"
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
                ? "Show recently imported movies"
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

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />

      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
