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
  NetworkInterfacePickerRow,
  NETWORK_INTERFACES_ALL,
  type NetworkInterfacesValue,
} from "@/components/dashboard/widget-settings/network-interface-picker-row";
import {
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export interface ServerStatsSettingsValue extends Record<string, unknown> {
  // Which Glances instances to read from. "all" stacks per-host blocks; an
  // array of UUIDs stacks just those hosts.
  instanceIds: InstanceBindingValue;
  showCpu: boolean;
  showRam: boolean;
  showGpu: boolean;
  showDisks: boolean;
  showNetwork: boolean;
  // Which interfaces the network section shows. "all" = every active,
  // non-loopback interface; an array restricts to those names.
  networkInterfaces: NetworkInterfacesValue;
}

export const SERVER_STATS_DEFAULT_SETTINGS: ServerStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  showCpu: true,
  showRam: true,
  showGpu: true,
  showDisks: true,
  // Off by default: hosts with many Docker containers expose a lot of
  // interfaces, so "all interfaces" is noisy. Opt in and pick the NIC(s).
  showNetwork: false,
  networkInterfaces: NETWORK_INTERFACES_ALL,
};

export function ServerStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<ServerStatsSettingsValue>(
    slotId,
    SERVER_STATS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="glances"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <SettingsSection label="Show">
        <ToggleCard>
          <Toggle
            label="CPU usage"
            description="Ring chart of total CPU load"
            value={settings.showCpu}
            onValueChange={(showCpu) => update({ showCpu })}
          />
          <Toggle
            label="RAM usage"
            description="Ring chart of memory utilization"
            value={settings.showRam}
            onValueChange={(showRam) => update({ showRam })}
          />
          <Toggle
            label="GPU usage"
            description="Ring charts of GPU compute and VRAM (hidden if no GPU)"
            value={settings.showGpu}
            onValueChange={(showGpu) => update({ showGpu })}
          />
          <Toggle
            label="Disk usage"
            description="Per-mount usage bars"
            value={settings.showDisks}
            onValueChange={(showDisks) => update({ showDisks })}
          />
          <Toggle
            label="Network throughput"
            description="Live send/receive rate per interface"
            value={settings.showNetwork}
            onValueChange={(showNetwork) => update({ showNetwork })}
          />
        </ToggleCard>
      </SettingsSection>
      {settings.showNetwork ? (
        <SettingsSection label="Network">
          <NetworkInterfacePickerRow
            instanceIds={settings.instanceIds}
            value={settings.networkInterfaces}
            onChange={(networkInterfaces) => update({ networkInterfaces })}
          />
        </SettingsSection>
      ) : null}
    </View>
  );
}
