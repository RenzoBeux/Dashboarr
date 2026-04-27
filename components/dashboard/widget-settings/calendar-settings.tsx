import { View, Text } from "react-native";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { useConfigStore } from "@/store/config-store";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export interface CalendarSettingsValue extends Record<string, unknown> {
  includeSonarr: boolean;
  includeRadarr: boolean;
  daysAhead: number;
  radarrReleaseType: "cinemas" | "digital" | "physical" | "any";
}

export const CALENDAR_DEFAULT_SETTINGS: CalendarSettingsValue = {
  includeSonarr: true,
  includeRadarr: true,
  daysAhead: 7,
  // Default to "any" so movies show up regardless of which release Radarr
  // marks them with — matches how Radarr's calendar groups by default.
  radarrReleaseType: "any",
};

const DAYS_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

const RELEASE_TYPE_OPTIONS: {
  value: CalendarSettingsValue["radarrReleaseType"];
  label: string;
}[] = [
  { value: "any", label: "Any" },
  { value: "cinemas", label: "Cinemas" },
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Physical" },
];

export function CalendarSettings(_props: WidgetSettingsComponentProps) {
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);
  const { settings, update } = useWidgetSettings<CalendarSettingsValue>(
    "calendar",
    CALENDAR_DEFAULT_SETTINGS,
  );

  return (
    <View className="px-4 py-2 gap-5">
      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Sources
        </Text>
        <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
          <Toggle
            label="Sonarr (TV episodes)"
            description={
              sonarrEnabled
                ? "Show upcoming episodes from monitored series"
                : "Enable Sonarr in Settings to use this source"
            }
            value={settings.includeSonarr && sonarrEnabled}
            onValueChange={(includeSonarr) => update({ includeSonarr })}
            disabled={!sonarrEnabled}
          />
          <Toggle
            label="Radarr (movies)"
            description={
              radarrEnabled
                ? "Show upcoming movies on the Radarr calendar"
                : "Enable Radarr in Settings to use this source"
            }
            value={settings.includeRadarr && radarrEnabled}
            onValueChange={(includeRadarr) => update({ includeRadarr })}
            disabled={!radarrEnabled}
          />
        </View>
      </View>

      <View>
        <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
          Look ahead
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {DAYS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={settings.daysAhead === option.value}
              onPress={() => update({ daysAhead: option.value })}
            />
          ))}
        </View>
      </View>

      {settings.includeRadarr && radarrEnabled && (
        <View>
          <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
            Movie release date
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {RELEASE_TYPE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={settings.radarrReleaseType === option.value}
                onPress={() => update({ radarrReleaseType: option.value })}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
