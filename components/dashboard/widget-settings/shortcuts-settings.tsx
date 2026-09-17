import { View, Text, ScrollView } from "react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useConfigStore } from "@/store/config-store";
import type { WebShortcut } from "@/store/config-store";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import { SettingsSection } from "@/components/dashboard/widget-settings/widget-settings-blocks";

// Same sentinel semantics as INSTANCE_BINDING_ALL: "all" means every shortcut,
// including ones added later. A subset is an explicit id list. Stored as a
// string so it survives JSON export/import unchanged.
export const SHORTCUTS_BINDING_ALL = "all" as const;
export type ShortcutsBindingValue = string[] | typeof SHORTCUTS_BINDING_ALL;

export interface ShortcutsSettingsValue extends Record<string, unknown> {
  shortcutIds: ShortcutsBindingValue;
}

export const SHORTCUTS_DEFAULT_SETTINGS: ShortcutsSettingsValue = {
  shortcutIds: SHORTCUTS_BINDING_ALL,
};

/**
 * The shortcuts this slot shows, in the global list's order. "all", a missing
 * value or an empty array mean every shortcut; ids that no longer exist are
 * ignored rather than rendered as blanks.
 */
export function resolveVisibleShortcuts(
  value: unknown,
  all: readonly WebShortcut[],
): WebShortcut[] {
  if (value == null || value === SHORTCUTS_BINDING_ALL) return [...all];
  if (!Array.isArray(value) || value.length === 0) return [...all];
  const allowed = new Set(value.filter((v): v is string => typeof v === "string"));
  return all.filter((s) => allowed.has(s.id));
}

export function ShortcutsSettings({ slotId }: WidgetSettingsComponentProps) {
  const shortcuts = useConfigStore((s) => s.shortcuts);
  const { settings, update } = useWidgetSettings<ShortcutsSettingsValue>(
    slotId,
    SHORTCUTS_DEFAULT_SETTINGS,
  );

  const value = settings.shortcutIds;
  const isAll = value === SHORTCUTS_BINDING_ALL;
  const selectedSet = new Set<string>(isAll ? [] : value);

  const toggle = (id: string) => {
    if (isAll) {
      update({ shortcutIds: [id] });
      return;
    }
    if (selectedSet.has(id)) {
      const next = value.filter((v) => v !== id);
      // Deselecting the last chip falls back to "all" so the widget never sits
      // in a degenerate "nothing selected" state via the picker.
      update({ shortcutIds: next.length === 0 ? SHORTCUTS_BINDING_ALL : next });
    } else {
      update({ shortcutIds: [...value, id] });
    }
  };

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Shortcuts on this dashboard">
        {shortcuts.length === 0 ? (
          <Text className="text-zinc-500 text-sm">
            No shortcuts yet. Add them from the gear on the Shortcuts card, or
            under Settings, Shortcuts.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            <FilterChip
              label="All shortcuts"
              selected={isAll}
              onPress={() => update({ shortcutIds: SHORTCUTS_BINDING_ALL })}
            />
            {shortcuts.map((shortcut) => (
              <FilterChip
                key={shortcut.id}
                label={shortcut.name}
                selected={selectedSet.has(shortcut.id)}
                onPress={() => toggle(shortcut.id)}
              />
            ))}
          </ScrollView>
        )}
      </SettingsSection>
    </View>
  );
}
