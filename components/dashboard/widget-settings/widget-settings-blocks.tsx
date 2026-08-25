import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";

/**
 * Section header + body wrapper used by every widget-settings panel. Keeps
 * the SCREAMING-uppercase label and gap consistent across widgets.
 */
export function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * Card containing a stack of `Toggle` rows separated by hairlines. Pass
 * `<Toggle>`s as children.
 */
export function ToggleCard({ children }: { children: ReactNode }) {
  return (
    <View className="bg-surface-light rounded-2xl border border-border px-4 divide-y divide-border/60">
      {children}
    </View>
  );
}

/**
 * Single-select chip row (status filters, sort orders, etc.). The chip rendered
 * for each option calls `onChange` with that option's value when pressed.
 */
export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <SettingsSection label={label}>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={String(option.value)}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

/**
 * Multi-select chip row. Pressing a chip toggles it; the last selected chip is
 * a no-op, since an empty selection would leave the widget filtering everything
 * out with nothing on screen explaining why. Pass `caption` for a line of help
 * text under the chips.
 */
export function MultiChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  caption,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  caption?: string;
}) {
  return (
    <SettingsSection label={label}>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={selected}
              onPress={() => {
                if (!selected) {
                  // Keep the caller's option order so the stored value doesn't
                  // depend on the order the user tapped the chips.
                  onChange(
                    options
                      .map((o) => o.value)
                      .filter((v) => v === option.value || value.includes(v)),
                  );
                } else if (value.length > 1) {
                  onChange(value.filter((v) => v !== option.value));
                }
              }}
            />
          );
        })}
      </View>
      {caption ? (
        <Text className="text-zinc-500 text-xs mt-2">{caption}</Text>
      ) : null}
    </SettingsSection>
  );
}

const DEFAULT_MAX_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

/**
 * Checkbox row for grouped checklists (interface picker, disk path picker).
 * Render inside a `bg-surface-light rounded-2xl … divide-y` container.
 */
export function SelectRow({
  label,
  caption,
  selected,
  onPress,
}: {
  label: string;
  caption?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3 py-2.5 active:opacity-70 ${
        selected ? "bg-primary/10" : ""
      }`}
    >
      <View
        className={`w-5 h-5 rounded-md items-center justify-center border ${
          selected ? "bg-primary border-primary" : "border-zinc-600"
        }`}
      >
        {selected ? <Icon icon={Check} size={14} color="#fff" /> : null}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text className="text-zinc-500 text-[0.7rem]" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Visibility section for a widget's "hide itself when there's nothing worth
 * showing" toggle (#282). Rendered as the last section of a widget's settings
 * form; the widget wires the value into `useHideWhenEmpty`. Most widgets use
 * the `HideWhenEmptyToggle` wrapper below — pass your own copy only when
 * "nothing worth showing" isn't emptiness (e.g. Service Health, whose grid is
 * never empty but is uninteresting while every service is healthy, #303).
 */
export function AutoHideToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingsSection label="Visibility">
      <ToggleCard>
        <Toggle
          label={label}
          description={description}
          value={value}
          onValueChange={onChange}
        />
      </ToggleCard>
    </SettingsSection>
  );
}

/**
 * Every slot-settings key written by an `AutoHideToggle`. Edit mode marks a slot
 * carrying one of these with the crossed-out-eye icon, so a "vanished" widget is
 * findable. Add a new auto-hide toggle's key here or its widget will disappear
 * with nothing in edit mode explaining why.
 */
const AUTO_HIDE_SETTING_KEYS = ["hideWhenEmpty", "hideWhenAllHealthy"] as const;

/** Whether this slot is configured to hide itself under some condition. */
export function slotAutoHides(settings?: Record<string, unknown>): boolean {
  return AUTO_HIDE_SETTING_KEYS.some((key) => settings?.[key] === true);
}

/**
 * "Hide when empty" toggle (#282) — the standard wording, used by every widget
 * whose emptiness is the signal.
 */
export function HideWhenEmptyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <AutoHideToggle
      label="Hide when empty"
      description="Hide this widget from the dashboard when there is nothing to show"
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * "Max items" chip selector. Defaults to 3/5/10/20; pass `options` to override
 * (e.g. now-playing widgets cap at 10).
 */
export function MaxItemsSelector({
  value,
  onChange,
  options = DEFAULT_MAX_OPTIONS,
}: {
  value: number;
  onChange: (value: number) => void;
  options?: readonly { value: number; label: string }[];
}) {
  return (
    <ChipGroup label="Max items" options={options} value={value} onChange={onChange} />
  );
}
