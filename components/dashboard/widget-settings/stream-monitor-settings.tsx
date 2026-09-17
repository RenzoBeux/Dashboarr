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
  HideWhenEmptyToggle,
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface StreamMonitorSettingsValue extends Record<string, unknown> {
  tautulliInstanceIds: InstanceBindingValue;
  tracearrInstanceIds: InstanceBindingValue;
  // Per-monitor on/off, same shape as the calendar widget's includeSonarr /
  // includeRadarr. The instance picker can't express "none" (it snaps back to
  // "all" when the last chip is deselected), so without these a user running
  // Tautulli + Tracearr against the same Plex server sees every stream twice
  // with no way to drop one monitor from the widget (#362).
  includeTautulli: boolean;
  includeTracearr: boolean;
  maxItems: number;
  hideUsers: string;
  showTranscoding: boolean;
  showUserAndDevice: boolean;
  showBandwidthSummary: boolean;
  hideWhenEmpty: boolean;
}

export const STREAM_MONITOR_DEFAULT_SETTINGS: StreamMonitorSettingsValue = {
  tautulliInstanceIds: INSTANCE_BINDING_ALL,
  tracearrInstanceIds: INSTANCE_BINDING_ALL,
  includeTautulli: true,
  includeTracearr: true,
  maxItems: 5,
  hideUsers: "",
  showTranscoding: true,
  showUserAndDevice: true,
  showBandwidthSummary: true,
  hideWhenEmpty: false,
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

export function StreamMonitorSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<StreamMonitorSettingsValue>(
    slotId,
    STREAM_MONITOR_DEFAULT_SETTINGS,
  );

  // Only offer a source toggle + instance picker for a monitor attached to
  // this workspace.
  const hasTautulli = useAttachedEnabledInstances("tautulli").length > 0;
  const hasTracearr = useAttachedEnabledInstances("tracearr").length > 0;
  const showTautulli = hasTautulli && settings.includeTautulli;
  const showTracearr = hasTracearr && settings.includeTracearr;

  return (
    <View className="px-4 py-2 gap-5">
      {(hasTautulli || hasTracearr) && (
        <SettingsSection label="Monitors">
          <ToggleCard>
            {hasTautulli && (
              <Toggle
                label="Tautulli"
                description={
                  hasTracearr ? "Turn off if Tracearr already shows the same streams" : undefined
                }
                value={settings.includeTautulli}
                onValueChange={(includeTautulli) => update({ includeTautulli })}
              />
            )}
            {hasTracearr && (
              <Toggle
                label="Tracearr"
                description={
                  hasTautulli ? "Turn off if Tautulli already shows the same streams" : undefined
                }
                value={settings.includeTracearr}
                onValueChange={(includeTracearr) => update({ includeTracearr })}
              />
            )}
          </ToggleCard>
        </SettingsSection>
      )}

      {(showTautulli || showTracearr) && (
        <View className="gap-4">
          {showTautulli && (
            <InstancePickerRow
              serviceId="tautulli"
              label="Tautulli instances"
              value={settings.tautulliInstanceIds}
              onChange={(tautulliInstanceIds) => update({ tautulliInstanceIds })}
            />
          )}
          {showTracearr && (
            <InstancePickerRow
              serviceId="tracearr"
              label="Tracearr instances"
              value={settings.tracearrInstanceIds}
              onChange={(tracearrInstanceIds) => update({ tracearrInstanceIds })}
            />
          )}
        </View>
      )}

      <SettingsSection label="Filters">
        <TextInput
          label="Hide users"
          placeholder="comma-separated usernames"
          value={settings.hideUsers}
          onChangeText={(hideUsers) => update({ hideUsers })}
        />
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
            description="Marks streams that are transcoding"
            value={settings.showTranscoding}
            onValueChange={(showTranscoding) => update({ showTranscoding })}
          />
          <Toggle
            label="Total bandwidth"
            description="Footer with the combined bandwidth of every stream"
            value={settings.showBandwidthSummary}
            onValueChange={(showBandwidthSummary) => update({ showBandwidthSummary })}
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
