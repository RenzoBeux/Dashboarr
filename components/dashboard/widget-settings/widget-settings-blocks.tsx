import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";

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
