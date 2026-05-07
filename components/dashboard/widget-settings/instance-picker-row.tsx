import { View, Text, ScrollView } from "react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";

// Special sentinel used in widget settings to mean "aggregate across every
// enabled instance for this kind". Stored as a string (not null) so it
// survives JSON export/import and is observable in dev tools. Distinct from
// "every currently-enabled id is in the array" because users adding a new
// instance later expect it to be included automatically when bound to "all".
export const INSTANCE_BINDING_ALL = "all" as const;
export type InstanceBindingValue = string[] | typeof INSTANCE_BINDING_ALL;

// Read-side type. Slots persisted before multi-select shipped carry a scalar
// `string` (single id) or are missing the field entirely; consumers normalize
// via resolveBoundInstances which accepts all three shapes.
export type StoredInstanceBinding =
  | InstanceBindingValue
  | string
  | undefined
  | null;

export function resolveBoundInstances<T extends { id: string }>(
  value: StoredInstanceBinding,
  allInstances: T[],
): T[] {
  if (value == null || value === INSTANCE_BINDING_ALL) return allInstances;
  if (typeof value === "string") {
    // Legacy scalar id (pre-multi-select). Match it like a single-element array.
    return allInstances.filter((i) => i.id === value);
  }
  if (!Array.isArray(value) || value.length === 0) return allInstances;
  const allowed = new Set(value);
  return allInstances.filter((i) => allowed.has(i.id));
}

interface InstancePickerRowProps {
  serviceId: ServiceId;
  value: InstanceBindingValue;
  onChange: (value: InstanceBindingValue) => void;
  // Custom section label. Defaults to the service kind's name (e.g. "Radarr
  // instance"); pass when a widget hosts more than one picker (calendar's
  // sonarr + radarr, both with their own labels).
  label?: string;
}

/**
 * Lets a widget's settings pin its data source to one or more specific
 * instances, or aggregate across every enabled instance of a service kind.
 * Renders a chip row inside a horizontal ScrollView so the row stays usable
 * even when a user has many instances and uiScale is at the upper end (per the
 * chip-row accessibility rule in CLAUDE.md).
 *
 * Behavior:
 * - "All instances" chip is mutually exclusive with the per-instance chips —
 *   tapping it always switches to the "all" sentinel so newly-added instances
 *   are auto-included.
 * - Per-instance chips toggle independently. Tapping one when bound to "all"
 *   drops "all" and starts a fresh subset containing just that id.
 * - Deselecting the last chip in subset mode falls back to "all" so the widget
 *   never enters a degenerate "no instances" state via the picker.
 */
export function InstancePickerRow({
  serviceId,
  value,
  onChange,
  label,
}: InstancePickerRowProps) {
  const instances = useEnabledInstances(serviceId);
  const heading =
    label ?? `${SERVICE_DEFAULTS[serviceId].name} instance`;

  const isAll = value === INSTANCE_BINDING_ALL;
  const selectedSet = new Set<string>(isAll ? [] : value);

  const toggleInstance = (id: string) => {
    if (isAll) {
      // Switching from "all" to a specific subset starts with just this id —
      // matches the prior single-select behavior on first tap.
      onChange([id]);
      return;
    }
    if (selectedSet.has(id)) {
      const next = (value as string[]).filter((v) => v !== id);
      onChange(next.length === 0 ? INSTANCE_BINDING_ALL : next);
    } else {
      // Preserve order: append to the existing array so the user sees a stable
      // selection list even if they toggle chips back and forth.
      onChange([...(value as string[]), id]);
    }
  };

  return (
    <View>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
        {heading}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        <FilterChip
          label="All instances"
          selected={isAll}
          onPress={() => onChange(INSTANCE_BINDING_ALL)}
        />
        {instances.map((inst) => (
          <FilterChip
            key={inst.id}
            label={inst.name}
            selected={selectedSet.has(inst.id)}
            onPress={() => toggleInstance(inst.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
