import { View, Text, ScrollView } from "react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";

// Special sentinel used in widget settings to mean "aggregate across every
// enabled instance for this kind". Stored as a string (not null) so it
// survives JSON export/import and is observable in dev tools.
export const INSTANCE_BINDING_ALL = "all" as const;
export type InstanceBindingValue = string | typeof INSTANCE_BINDING_ALL;

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
 * Lets a widget's settings pin its data source to a specific instance, or
 * aggregate across every enabled instance of a service kind. Renders a chip
 * row inside a horizontal ScrollView so the row stays usable even when a user
 * has many instances and uiScale is at the upper end (per the chip-row
 * accessibility rule in CLAUDE.md).
 *
 * If the kind has zero enabled instances, the picker still renders the "All
 * instances" chip so the widget settings UI doesn't collapse — the widget
 * itself shows an empty state.
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
          selected={value === INSTANCE_BINDING_ALL}
          onPress={() => onChange(INSTANCE_BINDING_ALL)}
        />
        {instances.map((inst) => (
          <FilterChip
            key={inst.id}
            label={inst.name}
            selected={value === inst.id}
            onPress={() => onChange(inst.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
