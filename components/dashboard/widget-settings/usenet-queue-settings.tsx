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
import type { ServiceId } from "@/lib/constants";

export type UsenetQueueSortBy = "progress" | "name" | "size" | "added";

export interface UsenetQueueSettingsValue extends Record<string, unknown> {
  instanceIds: InstanceBindingValue;
  maxItems: number;
  showDownloading: boolean;
  showPaused: boolean;
  showQueued: boolean;
  sortBy: UsenetQueueSortBy;
}

export const USENET_QUEUE_DEFAULT_SETTINGS: UsenetQueueSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  maxItems: 5,
  showDownloading: true,
  showPaused: true,
  showQueued: true,
  sortBy: "progress",
};

const SORT_OPTIONS: { value: UsenetQueueSortBy; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "size", label: "Size" },
  { value: "name", label: "Name" },
  { value: "added", label: "Recent" },
];

interface Props extends WidgetSettingsComponentProps {
  serviceId: ServiceId;
}

export function UsenetQueueSettings({ slotId, serviceId }: Props) {
  const { settings, update } = useWidgetSettings<UsenetQueueSettingsValue>(
    slotId,
    USENET_QUEUE_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <InstancePickerRow
        serviceId={serviceId}
        value={settings.instanceIds}
        onChange={(instanceIds) => update({ instanceIds })}
      />
      <SettingsSection label="Show states">
        <ToggleCard>
          <Toggle
            label="Downloading"
            description="In-progress, grabbing, verifying"
            value={settings.showDownloading}
            onValueChange={(showDownloading) => update({ showDownloading })}
          />
          <Toggle
            label="Paused"
            value={settings.showPaused}
            onValueChange={(showPaused) => update({ showPaused })}
          />
          <Toggle
            label="Queued"
            value={settings.showQueued}
            onValueChange={(showQueued) => update({ showQueued })}
          />
        </ToggleCard>
      </SettingsSection>

      <MaxItemsSelector
        value={settings.maxItems}
        onChange={(maxItems) => update({ maxItems })}
      />

      <ChipGroup
        label="Sort by"
        options={SORT_OPTIONS}
        value={settings.sortBy}
        onChange={(sortBy) => update({ sortBy })}
      />
    </View>
  );
}
