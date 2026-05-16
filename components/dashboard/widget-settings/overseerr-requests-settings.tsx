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
  ChipGroup,
  MaxItemsSelector,
  SettingsSection,
  ToggleCard,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

export type OverseerrStatusFilter = "pending" | "pending-approved" | "all";

export interface OverseerrRequestsSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  statusFilter: OverseerrStatusFilter;
  maxItems: number;
  showRequester: boolean;
}

export const OVERSEERR_REQUESTS_DEFAULT_SETTINGS: OverseerrRequestsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  statusFilter: "pending",
  maxItems: 5,
  showRequester: true,
};

const STATUS_OPTIONS: { value: OverseerrStatusFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "pending-approved", label: "Pending + approved" },
  { value: "all", label: "All" },
];

export function OverseerrRequestsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<OverseerrRequestsSettingsValue>(
    slotId,
    OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId="overseerr"
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        value={settings.statusFilter}
        onChange={(statusFilter) => update({ statusFilter })}
      />

      <SettingsSection label="Show">
        <ToggleCard>
          <Toggle
            label="Requester"
            description="Username and request date under each item"
            value={settings.showRequester}
            onValueChange={(showRequester) => update({ showRequester })}
          />
        </ToggleCard>
      </SettingsSection>

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />
    </View>
  );
}
