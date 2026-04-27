import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export type DownloadsSortBy = "speed" | "progress" | "eta" | "added";

export interface DownloadsSettingsValue extends Record<string, unknown> {
  maxItems: number;
  showDownloading: boolean;
  showSeeding: boolean;
  showPaused: boolean;
  showErrored: boolean;
  sortBy: DownloadsSortBy;
}

export const DOWNLOADS_DEFAULT_SETTINGS: DownloadsSettingsValue = {
  maxItems: 5,
  showDownloading: true,
  showSeeding: true,
  showPaused: false,
  showErrored: false,
  sortBy: "speed",
};

const MAX_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

const SORT_OPTIONS: { value: DownloadsSortBy; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "progress", label: "Progress" },
  { value: "eta", label: "ETA" },
  { value: "added", label: "Recent" },
];

export function DownloadsSettings(_props: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<DownloadsSettingsValue>(
    "downloads",
    DOWNLOADS_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Show states
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
          <Toggle
            label="Downloading"
            description="In-progress, queued, stalled and checking"
            value={settings.showDownloading}
            onValueChange={(showDownloading) => update({ showDownloading })}
          />
          <Toggle
            label="Seeding"
            description="Uploading and queued for upload"
            value={settings.showSeeding}
            onValueChange={(showSeeding) => update({ showSeeding })}
          />
          <Toggle
            label="Paused"
            value={settings.showPaused}
            onValueChange={(showPaused) => update({ showPaused })}
          />
          <Toggle
            label="Errored"
            description="Errors and missing files"
            value={settings.showErrored}
            onValueChange={(showErrored) => update({ showErrored })}
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

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Sort by
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.sortBy === option.value}
              onPress={() => update({ sortBy: option.value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
