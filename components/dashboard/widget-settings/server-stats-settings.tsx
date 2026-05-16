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
}

export const SERVER_STATS_DEFAULT_SETTINGS: ServerStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  showCpu: true,
  showRam: true,
  showGpu: true,
  showDisks: true,
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
        </ToggleCard>
      </SettingsSection>
    </View>
  );
}
