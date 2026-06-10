import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import {
  getNet,
  rankedInterfaces,
  isVirtualInterface,
  NETWORK_INTERFACES_ALL,
  type NetworkInterfacesValue,
  type GlancesNetRate,
} from "@/services/glances-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import {
  resolveBoundInstances,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { SelectRow } from "@/components/dashboard/widget-settings/widget-settings-blocks";
import { formatSpeed } from "@/lib/utils";

// Re-exported so settings panels can keep importing the value contract from the
// picker they render. Source of truth lives in services/glances-api.
export { NETWORK_INTERFACES_ALL, type NetworkInterfacesValue };

const FAST_POLL = 5000;

interface NetworkInterfacePickerRowProps {
  // Which Glances instances the widget is bound to — the candidate interface
  // names are gathered from these hosts.
  instanceIds: InstanceBindingValue;
  value: NetworkInterfacesValue;
  onChange: (value: NetworkInterfacesValue) => void;
}

/**
 * Lets a widget restrict its network section to specific interfaces, or track
 * every active real one. Candidate interfaces are fetched live from the bound
 * Glances host(s) and rendered as a grouped checklist: an "All active" default,
 * then physical NICs (with their live ↓/↑ rate to make the busy one obvious),
 * then a collapsed "Virtual / Docker" group so container hosts aren't a wall of
 * veth chips. Selections are stored by interface name and applied per-instance.
 */
export function NetworkInterfacePickerRow({
  instanceIds,
  value,
  onChange,
}: NetworkInterfacePickerRowProps) {
  const allInstances = useEnabledInstances("glances");
  const instances = resolveBoundInstances(instanceIds, allInstances);

  // Reuse the same query key the widgets/screen poll on, so candidates appear
  // instantly when data is already cached.
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["glances", inst.id, "net"] as const,
      queryFn: () => getNet(inst.id),
      refetchInterval: FAST_POLL,
    })),
  });

  // Merge interfaces across bound hosts by name (summing rates on collisions),
  // then sort by name for a STABLE order — sorting by live throughput would
  // reorder rows under the user's finger as rates update.
  const byName = new Map<string, GlancesNetRate>();
  for (const q of queries) {
    if (!q.data) continue;
    for (const iface of rankedInterfaces(q.data)) {
      const existing = byName.get(iface.interface_name);
      if (existing) {
        existing.rx += iface.rx;
        existing.tx += iface.tx;
      } else {
        byName.set(iface.interface_name, { ...iface });
      }
    }
  }
  const merged = Array.from(byName.values()).sort((a, b) =>
    a.interface_name.localeCompare(b.interface_name),
  );
  const physical = merged.filter((i) => !isVirtualInterface(i.interface_name));
  const virtual = merged.filter((i) => isVirtualInterface(i.interface_name));

  const isAll = value === NETWORK_INTERFACES_ALL;
  const selectedSet = new Set<string>(isAll ? [] : value);

  // Auto-expand the virtual group when one of its interfaces is already picked,
  // so a saved selection is never hidden.
  const hasVirtualSelected = virtual.some((i) => selectedSet.has(i.interface_name));
  const [showVirtual, setShowVirtual] = useState(false);
  const virtualExpanded = showVirtual || hasVirtualSelected;

  const toggle = (name: string) => {
    if (isAll) {
      // From "all" → start a fresh explicit subset with just this interface.
      onChange([name]);
      return;
    }
    if (selectedSet.has(name)) {
      const next = (value as string[]).filter((v) => v !== name);
      onChange(next.length === 0 ? NETWORK_INTERFACES_ALL : next);
    } else {
      onChange([...(value as string[]), name]);
    }
  };

  return (
    <View>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
        Interfaces
      </Text>
      <View className="bg-surface-light rounded-2xl border border-border divide-y divide-border/60 overflow-hidden">
        <SelectRow
          label="All active interfaces"
          caption="Real NICs only — Docker/virtual excluded"
          selected={isAll}
          onPress={() => onChange(NETWORK_INTERFACES_ALL)}
        />
        {physical.map((iface) => (
          <SelectRow
            key={iface.interface_name}
            label={iface.alias || iface.interface_name}
            caption={rateCaption(iface)}
            selected={!isAll && selectedSet.has(iface.interface_name)}
            onPress={() => toggle(iface.interface_name)}
          />
        ))}

        {virtual.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowVirtual((v) => !v)}
              className="flex-row items-center justify-between px-3 py-2.5 active:opacity-70"
            >
              <Text className="text-zinc-400 text-xs uppercase tracking-wider">
                Virtual / Docker ({virtual.length})
              </Text>
              <Icon
                icon={virtualExpanded ? ChevronUp : ChevronDown}
                size={16}
                color="#71717a"
              />
            </Pressable>
            {virtualExpanded &&
              virtual.map((iface) => (
                <SelectRow
                  key={iface.interface_name}
                  label={iface.alias || iface.interface_name}
                  caption={rateCaption(iface)}
                  selected={!isAll && selectedSet.has(iface.interface_name)}
                  onPress={() => toggle(iface.interface_name)}
                />
              ))}
          </>
        )}
      </View>
      {merged.length === 0 ? (
        <Text className="text-zinc-600 text-xs mt-2">
          No active interfaces detected yet.
        </Text>
      ) : null}
    </View>
  );
}

function rateCaption(iface: GlancesNetRate): string {
  if (iface.rx + iface.tx <= 0) return "idle";
  return `↓ ${formatSpeed(iface.rx)}   ↑ ${formatSpeed(iface.tx)}`;
}
