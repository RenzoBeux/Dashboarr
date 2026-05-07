import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface ServerStatsSettingsValue extends Record<string, unknown> {
  // Which Glances instance to read from. "all" stacks per-host blocks; a UUID
  // pins to one host.
  instanceId: InstanceBindingValue;
  showCpu: boolean;
  showRam: boolean;
  showDisks: boolean;
}

export const SERVER_STATS_DEFAULT_SETTINGS: ServerStatsSettingsValue = {
  instanceId: INSTANCE_BINDING_ALL,
  showCpu: true,
  showRam: true,
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
        value={settings.instanceId}
        onChange={(instanceId) => update({ instanceId })}
      />
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Show
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
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
            label="Disk usage"
            description="Per-mount usage bars"
            value={settings.showDisks}
            onValueChange={(showDisks) => update({ showDisks })}
          />
        </View>
      </View>
    </View>
  );
}
