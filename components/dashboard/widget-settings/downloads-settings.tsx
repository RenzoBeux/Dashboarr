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
  ChipGroup,
  HideWhenEmptyToggle,
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export type DownloadsSortBy = "speed" | "progress" | "eta" | "added";

export interface DownloadsSettingsValue extends Record<string, unknown> {
  // Which qBittorrent instances this widget shows. "all" aggregates every
  // enabled instance; an array of UUIDs aggregates just those. Defaults to "all".
  instanceIds: InstanceBindingValue;
  maxItems: number;
  showDownloading: boolean;
  showSeeding: boolean;
  showPaused: boolean;
  showErrored: boolean;
  sortBy: DownloadsSortBy;
  hideWhenEmpty: boolean;
}

export const DOWNLOADS_DEFAULT_SETTINGS: DownloadsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
  showDownloading: true,
  showSeeding: true,
  showPaused: false,
  showErrored: false,
  sortBy: "speed",
  hideWhenEmpty: false,
};

const SORT_OPTIONS: { value: DownloadsSortBy; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "progress", label: "Progress" },
  { value: "eta", label: "ETA" },
  { value: "added", label: "Recent" },
];

export function DownloadsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<DownloadsSettingsValue>(
    slotId,
    DOWNLOADS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      {/* Binds only qBittorrent instances — rtorrent has no per-widget binding
          yet (phase 2) and always aggregates every enabled instance. The
          explicit label keeps that scope clear when both clients are present. */}
      <InstancePickerRow
        serviceId="qbittorrent"
        label="qBittorrent instances"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <SettingsSection label="Show states">
        <ToggleCard>
          <Toggle
            label="Downloading"
            description="In-progress, queued, stalled and checking"
            value={settings.showDownloading}
            onValueChange={(showDownloading) => update({ showDownloading })}
          />
          <Toggle
            label="Seeding"
            description="Uploading and queued for upload"
            value={settings.showSeeding}
            onValueChange={(showSeeding) => update({ showSeeding })}
          />
          <Toggle
            label="Paused"
            value={settings.showPaused}
            onValueChange={(showPaused) => update({ showPaused })}
          />
          <Toggle
            label="Errored"
            description="Errors and missing files"
            value={settings.showErrored}
            onValueChange={(showErrored) => update({ showErrored })}
          />
        </ToggleCard>
      </SettingsSection>

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />

      <ChipGroup
        label="Sort by"
        options={SORT_OPTIONS}
        value={settings.sortBy}
        onChange={(sortBy) => update({ sortBy })}
      />

      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
