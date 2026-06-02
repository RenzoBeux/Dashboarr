import { View } from "react-native";
import { TextInput } from "@/components/ui/text-input";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  ChipGroup,
  SettingsSection,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";
import {
  resolveStreamingService,
  type StreamingServiceId,
} from "@/lib/streaming-bandwidth";

const STREAMING_SERVICES: readonly StreamingServiceId[] = [
  "tautulli",
  "plex",
  "jellyfin",
  "emby",
];

export interface StreamingBandwidthSettingsValue extends Record<string, unknown> {
  // Optional header above the pills — lets a user place several widgets for
  // different servers ("Plex", "Jellyfin", …).
  title: string;
  // Which media server to read streaming bandwidth from.
  service: StreamingServiceId;
  // Which instances of that service to sum.
  instanceIds: InstanceBindingValue;
}

export const STREAMING_BANDWIDTH_DEFAULT_SETTINGS: StreamingBandwidthSettingsValue = {
  title: "",
  service: "tautulli",
  instanceIds: INSTANCE_BINDING_ALL,
};

export function StreamingBandwidthSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<StreamingBandwidthSettingsValue>(
    slotId,
    STREAMING_BANDWIDTH_DEFAULT_SETTINGS,
  );

  // Called unconditionally (stable hook order); cheap selectors.
  const tautulli = useEnabledInstances("tautulli");
  const plex = useEnabledInstances("plex");
  const jellyfin = useEnabledInstances("jellyfin");
  const emby = useEnabledInstances("emby");
  const countByService: Record<StreamingServiceId, number> = {
    tautulli: tautulli.length,
    plex: plex.length,
    jellyfin: jellyfin.length,
    emby: emby.length,
  };
  const configured = STREAMING_SERVICES.filter((s) => countByService[s] > 0);
  const service = resolveStreamingService(settings.service, configured);

  const serviceOptions = configured.map((s) => ({
    value: s,
    label: SERVICE_DEFAULTS[s].name,
  }));

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Title">
        <TextInput
          placeholder="e.g. Plex, Streaming"
          value={settings.title}
          onChangeText={(title) => update({ title })}
          maxLength={24}
          returnKeyType="done"
        />
      </SettingsSection>

      {configured.length > 1 && service && (
        <ChipGroup
          label="Source"
          options={serviceOptions}
          value={service}
          onChange={(next) => update({ service: next })}
        />
      )}

      {service && (
        <InstancePickerRow
          serviceId={service}
          value={settings.instanceIds}
          onChange={(instanceIds) => update({ instanceIds })}
        />
      )}
    </View>
  );
}
