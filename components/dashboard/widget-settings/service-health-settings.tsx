import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS, SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface ServiceHealthSettingsValue extends Record<string, unknown> {
  // Kinds the user has explicitly hidden on this widget. Kinds NOT in this
  // list show by default — that way newly enabled services automatically
  // appear without the user having to opt them in. Stored as a string array
  // (rather than a boolean map) so legacy slots without the field render as
  // "show everything", matching the pre-settings behavior of the card.
  hiddenKinds: ServiceId[];
  // Per-kind instance binding. Missing keys default to "all" so adding a
  // second qBittorrent later auto-shows it on this widget instead of being
  // silently ignored. Each rendered instance gets its own indicator chip.
  instances: Partial<Record<ServiceId, InstanceBindingValue>>;
}

export const SERVICE_HEALTH_DEFAULT_SETTINGS: ServiceHealthSettingsValue = {
  hiddenKinds: [],
  instances: {},
};

export function ServiceHealthSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<ServiceHealthSettingsValue>(
    slotId,
    SERVICE_HEALTH_DEFAULT_SETTINGS,
  );
  const serviceInstances = useConfigStore((s) => s.serviceInstances);

  // Only surface kinds the user has actually configured + enabled. Hiding a
  // kind in app settings already removes it from the dashboard, so there's no
  // point listing it here — the widget can't show what isn't reachable.
  const configuredKinds = SERVICE_IDS.filter(
    (id) => (serviceInstances[id] ?? []).some((i) => i.enabled),
  );

  if (configuredKinds.length === 0) {
    return (
      <View className="px-4 py-2">
        <Text className="text-zinc-500 text-sm">
          No services configured yet — set up at least one in app settings to
          customize this widget.
        </Text>
      </View>
    );
  }

  const hiddenSet = new Set(settings.hiddenKinds);
  const toggleKind = (id: ServiceId, show: boolean) => {
    const next = new Set(hiddenSet);
    if (show) next.delete(id);
    else next.add(id);
    update({ hiddenKinds: Array.from(next) });
  };
  const setBinding = (id: ServiceId, value: InstanceBindingValue) => {
    update({ instances: { ...settings.instances, [id]: value } });
  };

  return (
    <View className="px-4 py-2 gap-5">
      {configuredKinds.map((id) => {
        const isShown = !hiddenSet.has(id);
        const instances = serviceInstances[id] ?? [];
        const enabledInstances = instances.filter((i) => i.enabled);
        const binding = settings.instances[id] ?? INSTANCE_BINDING_ALL;

        return (
          <View key={id} className="gap-3">
            <View className="bg-surface-light rounded-2xl border border-border px-4">
              <Toggle
                label={SERVICE_DEFAULTS[id].name}
                description={
                  enabledInstances.length === 1
                    ? "1 instance enabled"
                    : `${enabledInstances.length} instances enabled`
                }
                value={isShown}
                onValueChange={(show) => toggleKind(id, show)}
              />
            </View>
            {isShown && enabledInstances.length > 1 && (
              <InstancePickerRow
                serviceId={id}
                value={binding}
                onChange={(value) => setBinding(id, value)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
