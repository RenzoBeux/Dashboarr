import { View } from "react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Select } from "@/components/ui/select";
import { APP_THEMES, type AppThemeId } from "@/lib/app-themes";
import { type WeekStart } from "@/lib/week-start";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { useConfigStore } from "@/store/config-store";
import { brrrHaptic } from "@/lib/haptics";

export default function AppearanceSettingsScreen() {
  const uiScale = useConfigStore((s) => s.uiScale);
  const setUiScale = useConfigStore((s) => s.setUiScale);
  const appTheme = useConfigStore((s) => s.appTheme);
  const setAppTheme = useConfigStore((s) => s.setAppTheme);
  const hapticsEnabled = useConfigStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useConfigStore((s) => s.setHapticsEnabled);
  const weekStart = useConfigStore((s) => s.weekStart);
  const setWeekStart = useConfigStore((s) => s.setWeekStart);

  return (
    <ScreenWrapper>
      <BackHeader title="Appearance" />

      <SettingsGroup title="Appearance">
        <View className="px-4 py-3">
          <Select<number>
            label="UI Scale"
            value={uiScale}
            options={[
              { value: 1, label: "Normal", description: "Default size" },
              { value: 1.15, label: "Large", description: "+15% fonts, spacing, and icons" },
              { value: 1.3, label: "Extra Large", description: "+30% fonts, spacing, and icons" },
            ]}
            onChange={(v) => setUiScale(v as 1 | 1.15 | 1.3)}
          />
        </View>
        <View className="px-4 py-3">
          <Select<AppThemeId>
            label="Theme"
            value={appTheme}
            options={APP_THEMES.map((t) => ({
              value: t.id,
              label: t.label,
              description: t.description,
            }))}
            onChange={setAppTheme}
          />
        </View>
        <View className="px-4 py-3">
          <Select<WeekStart>
            label="First day of week"
            value={weekStart}
            options={[
              {
                value: "auto",
                label: "Auto",
                description: "Match the device's week start",
              },
              { value: "sunday", label: "Sunday" },
              { value: "monday", label: "Monday" },
            ]}
            onChange={setWeekStart}
          />
        </View>
        <SettingsToggleRow
          label="Haptic feedback"
          description="Vibrations on taps, toggles, and refreshes"
          value={hapticsEnabled}
          onValueChange={(v) => {
            setHapticsEnabled(v);
            if (v) brrrHaptic();
          }}
        />
      </SettingsGroup>
    </ScreenWrapper>
  );
}
