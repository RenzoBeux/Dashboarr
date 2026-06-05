import { View, Text, Pressable } from "react-native";
import { ArrowUp, ArrowDown } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useConfigStore } from "@/store/config-store";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import { SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";
import { applyServicesOrder } from "@/lib/services-order";
import { lightHaptic } from "@/lib/haptics";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { DraggableKindList } from "@/components/dashboard/widget-settings/draggable-kind-list";

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
  // Whether to show the L/R corner badge (#148) marking each instance as using
  // its local or remote URL. Defaults on; legacy slots without the field merge
  // to the default at read time (see useWidgetSettings).
  showUrlBadge: boolean;
}

export const SERVICE_HEALTH_DEFAULT_SETTINGS: ServiceHealthSettingsValue = {
  hiddenKinds: [],
  instances: {},
  showUrlBadge: true,
};

export function ServiceHealthSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<ServiceHealthSettingsValue>(
    slotId,
    SERVICE_HEALTH_DEFAULT_SETTINGS,
  );
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const servicesOrder = useConfigStore((s) => s.servicesOrder);
  const setServicesOrder = useConfigStore((s) => s.setServicesOrder);
  const attached = useAttachedInstances();

  // Only surface kinds with an instance attached to the active workspace, in
  // the user-defined order. The Services card itself only renders attached
  // instances (#148), so listing an unattached kind here would let the user
  // configure something the card never shows. The order is the shared
  // servicesOrder so the Status widget and the Services tab agree.
  const fullOrder = applyServicesOrder(servicesOrder);
  const configuredKinds = fullOrder.filter((id) =>
    (serviceInstances[id] ?? []).some((i) => i.enabled && attached.has(i.id)),
  );

  // Project a reordered list of *configured* kinds back onto the full order,
  // preserving the positions of any disabled/unconfigured kinds interleaved
  // between them. Walk the full order in place: every slot occupied by a
  // configured kind absorbs the next id from the new configured list, in
  // order; non-configured slots pass through untouched.
  const commitVisibleOrder = (nextConfigured: ServiceId[]) => {
    const configuredSet = new Set(configuredKinds);
    const nextFull = [...fullOrder];
    let cursor = 0;
    for (let i = 0; i < nextFull.length; i++) {
      if (configuredSet.has(nextFull[i])) {
        nextFull[i] = nextConfigured[cursor++];
      }
    }
    setServicesOrder(nextFull);
  };

  // Arrow-button move: swap `id` with its previous/next visible neighbor. The
  // arrows stay as a tap-only fallback alongside the drag handle so users who
  // miss the long-press affordance (or have motor difficulty with drag) can
  // still reorder. Drag-and-drop is the primary path; arrows are secondary.
  const moveKind = (id: ServiceId, direction: "up" | "down") => {
    const visibleIdx = configuredKinds.indexOf(id);
    if (visibleIdx === -1) return;
    const target = direction === "up" ? visibleIdx - 1 : visibleIdx + 1;
    if (target < 0 || target >= configuredKinds.length) return;
    const next = [...configuredKinds];
    [next[visibleIdx], next[target]] = [next[target], next[visibleIdx]];
    lightHaptic();
    commitVisibleOrder(next);
  };

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

  const renderRow = (id: ServiceId) => {
    const isShown = !hiddenSet.has(id);
    const instances = serviceInstances[id] ?? [];
    // Scoped to the workspace so the "N instances enabled" subtitle and the
    // (> 1) picker gate below match what the card actually shows (#148).
    const enabledInstances = instances.filter(
      (i) => i.enabled && attached.has(i.id),
    );
    const binding = settings.instances[id] ?? INSTANCE_BINDING_ALL;
    const idx = configuredKinds.indexOf(id);
    const isFirst = idx === 0;
    const isLast = idx === configuredKinds.length - 1;
    const canReorder = configuredKinds.length > 1;

    return (
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 bg-surface-light rounded-2xl border border-border px-4">
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
          {canReorder && (
            <View className="flex-col items-center">
              <Pressable
                onPress={() => moveKind(id, "up")}
                disabled={isFirst}
                hitSlop={6}
                className="p-1 active:opacity-60"
                style={{ opacity: isFirst ? 0.3 : 1 }}
              >
                <Icon icon={ArrowUp} size={16} color="#a1a1aa" />
              </Pressable>
              <Pressable
                onPress={() => moveKind(id, "down")}
                disabled={isLast}
                hitSlop={6}
                className="p-1 active:opacity-60"
                style={{ opacity: isLast ? 0.3 : 1 }}
              >
                <Icon icon={ArrowDown} size={16} color="#a1a1aa" />
              </Pressable>
            </View>
          )}
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
  };

  return (
    <View className="px-4 py-2 gap-5">
      <View className="bg-surface-light rounded-2xl border border-border px-4">
        <Toggle
          label="Local/remote badge"
          description="Mark each service with an L or R for the URL it's currently using"
          value={settings.showUrlBadge}
          onValueChange={(v) => update({ showUrlBadge: v })}
        />
      </View>
      {configuredKinds.length > 1 && (
        <Text className="text-zinc-500 text-xs">
          Long-press a row to drag it. Order is shared with the Services tab.
        </Text>
      )}
      {configuredKinds.length > 1 ? (
        <DraggableKindList
          items={configuredKinds}
          onReorder={commitVisibleOrder}
          renderItem={renderRow}
        />
      ) : (
        renderRow(configuredKinds[0])
      )}
    </View>
  );
}
