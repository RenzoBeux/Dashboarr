import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export type OverseerrStatusFilter = "pending" | "pending-approved" | "all";

export interface OverseerrRequestsSettingsValue extends Record<string, unknown> {
  statusFilter: OverseerrStatusFilter;
  maxItems: number;
  showRequester: boolean;
}

export const OVERSEERR_REQUESTS_DEFAULT_SETTINGS: OverseerrRequestsSettingsValue = {
  statusFilter: "pending",
  maxItems: 5,
  showRequester: true,
};

const STATUS_OPTIONS: { value: OverseerrStatusFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "pending-approved", label: "Pending + approved" },
  { value: "all", label: "All" },
];

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

export function OverseerrRequestsSettings(_props: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<OverseerrRequestsSettingsValue>(
    "overseerr-requests",
    OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Status
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.statusFilter === option.value}
              onPress={() => update({ statusFilter: option.value })}
            />
          ))}
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Show
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
          <Toggle
            label="Requester"
            description="Username and request date under each item"
            value={settings.showRequester}
            onValueChange={(showRequester) => update({ showRequester })}
          />
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Max items
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {MAX_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.maxItems === option.value}
              onPress={() => update({ maxItems: option.value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
