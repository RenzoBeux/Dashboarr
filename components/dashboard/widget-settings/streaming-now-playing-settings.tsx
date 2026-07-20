import { View } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { TextInput } from "@/components/ui/text-input";
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
import type { ServiceId } from "@/lib/constants";

export interface StreamingNowPlayingSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
  hideLocalPlays: boolean;
  hideUsers: string;
  showBitrate: boolean;
  showTranscoding: boolean;
  showUserAndDevice: boolean;
  hideWhenEmpty: boolean;
}

export const STREAMING_NOW_PLAYING_DEFAULT_SETTINGS: StreamingNowPlayingSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 3,
  hideLocalPlays: false,
  hideUsers: "",
  showBitrate: false,
  showTranscoding: true,
  showUserAndDevice: true,
  hideWhenEmpty: false,
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

interface StreamingNowPlayingSettingsProps extends WidgetSettingsComponentProps {
  serviceId: ServiceId;
  hideLocalPlaysDescription: string;
  bitrateDescription: string;
}

export function StreamingNowPlayingSettings({
  slotId,
  serviceId,
  hideLocalPlaysDescription,
  bitrateDescription,
}: StreamingNowPlayingSettingsProps) {
  const { settings, update } = useWidgetSettings<StreamingNowPlayingSettingsValue>(
    slotId,
    STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId={serviceId}
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <SettingsSection label="Filters">
        <ToggleCard>
          <Toggle
            label="Hide local plays"
            description={hideLocalPlaysDescription}
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
          <Toggle
            label="Bitrate"
            description={bitrateDescription}
            value={settings.showBitrate}
            onValueChange={(showBitrate) => update({ showBitrate })}
          />
        </ToggleCard>
      </SettingsSection>

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
        options={MAX_OPTIONS}
      />

      <HideWhenEmptyToggle
        value={settings.hideWhenEmpty}
        onChange={(hideWhenEmpty) => update({ hideWhenEmpty })}
      />
    </View>
  );
}
