import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { TextInput } from "@/components/ui/text-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export interface TautulliActivitySettingsValue extends Record<string, unknown> {
  maxItems: number;
  hideUsers: string;
  showBitrate: boolean;
  showTranscoding: boolean;
  showUserAndDevice: boolean;
  showBandwidthSummary: boolean;
}

export const TAUTULLI_ACTIVITY_DEFAULT_SETTINGS: TautulliActivitySettingsValue = {
  maxItems: 3,
  hideUsers: "",
  showBitrate: false,
  showTranscoding: true,
  showUserAndDevice: true,
  showBandwidthSummary: true,
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

export function TautulliActivitySettings(_props: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<TautulliActivitySettingsValue>(
    "tautulli-activity",
    TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Filters
        </Text>
        <View>
          <TextInput
            label="Hide users"
            placeholder="comma-separated usernames"
            value={settings.hideUsers}
            onChangeText={(hideUsers) => update({ hideUsers })}
          />
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Show
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
          <Toggle
            label="User and device"
            value={settings.showUserAndDevice}
            onValueChange={(showUserAndDevice) => update({ showUserAndDevice })}
          />
          <Toggle
            label="Transcoding indicator"
            description="Highlights direct play, copy, or transcode"
            value={settings.showTranscoding}
            onValueChange={(showTranscoding) => update({ showTranscoding })}
          />
          <Toggle
            label="Per-stream bitrate"
            value={settings.showBitrate}
            onValueChange={(showBitrate) => update({ showBitrate })}
          />
          <Toggle
            label="Total bandwidth"
            description="Footer with the combined bandwidth of every stream"
            value={settings.showBandwidthSummary}
            onValueChange={(showBandwidthSummary) => update({ showBandwidthSummary })}
          />
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Max items
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {MAX_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.maxItems === option.value}
              onPress={() => update({ maxItems: option.value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
