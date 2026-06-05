import { View } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { TextInput } from "@/components/ui/text-input";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useAttachedEnabledInstances } from "@/hooks/use-workspace-instances";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface CombinedNowPlayingSettingsValue extends Record<string, unknown> {
  plexInstanceIds: InstanceBindingValue;
  jellyfinInstanceIds: InstanceBindingValue;
  embyInstanceIds: InstanceBindingValue;
  maxItems: number;
  hideLocalPlays: boolean;
  hideUsers: string;
  showTranscoding: boolean;
  showUserAndDevice: boolean;
}

export const COMBINED_NOW_PLAYING_DEFAULT_SETTINGS: CombinedNowPlayingSettingsValue = {
  plexInstanceIds: INSTANCE_BINDING_ALL,
  jellyfinInstanceIds: INSTANCE_BINDING_ALL,
  embyInstanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
  hideLocalPlays: false,
  hideUsers: "",
  showTranscoding: true,
  showUserAndDevice: true,
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

export function CombinedNowPlayingSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<CombinedNowPlayingSettingsValue>(
    slotId,
    COMBINED_NOW_PLAYING_DEFAULT_SETTINGS,
  );

  // Only offer an instance picker for a kind attached to this workspace.
  // Deselect all of a kind's instances to drop it from the widget.
  const hasPlex = useAttachedEnabledInstances("plex").length > 0;
  const hasJellyfin = useAttachedEnabledInstances("jellyfin").length > 0;
  const hasEmby = useAttachedEnabledInstances("emby").length > 0;

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Servers">
        <View className="gap-4">
          {hasPlex && (
            <InstancePickerRow
              serviceId="plex"
              label="Plex instances"
              value={settings.plexInstanceIds}
              onChange={(plexInstanceIds) => update({ plexInstanceIds })}
            />
          )}
          {hasJellyfin && (
            <InstancePickerRow
              serviceId="jellyfin"
              label="Jellyfin instances"
              value={settings.jellyfinInstanceIds}
              onChange={(jellyfinInstanceIds) => update({ jellyfinInstanceIds })}
            />
          )}
          {hasEmby && (
            <InstancePickerRow
              serviceId="emby"
              label="Emby instances"
              value={settings.embyInstanceIds}
              onChange={(embyInstanceIds) => update({ embyInstanceIds })}
            />
          )}
        </View>
      </SettingsSection>

      <SettingsSection label="Filters">
        <ToggleCard>
          <Toggle
            label="Hide local plays"
            description="Skip sessions whose endpoint is on a private network"
            value={settings.hideLocalPlays}
            onValueChange={(hideLocalPlays) => update({ hideLocalPlays })}
          />
        </ToggleCard>
        <View className="mt-3">
          <TextInput
            label="Hide users"
            placeholder="comma-separated usernames"
            value={settings.hideUsers}
            onChangeText={(hideUsers) => update({ hideUsers })}
          />
        </View>
      </SettingsSection>

      <SettingsSection label="Show">
        <ToggleCard>
          <Toggle
            label="User and device"
            value={settings.showUserAndDevice}
            onValueChange={(showUserAndDevice) => update({ showUserAndDevice })}
          />
          <Toggle
            label="Transcoding indicator"
            value={settings.showTranscoding}
            onValueChange={(showTranscoding) => update({ showTranscoding })}
          />
        </ToggleCard>
      </SettingsSection>

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
        options={MAX_OPTIONS}
      />
    </View>
  );
}
