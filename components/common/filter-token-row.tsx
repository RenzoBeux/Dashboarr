import { ScrollView, Pressable, Text } from "react-native";
import { X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { lightHaptic } from "@/lib/haptics";
import type { FilterToken } from "@/lib/library-filter-tokens";

/**
 * The applied filters under a library search field: one chip per filter or
 * sort that differs from its default, each removed on its own with a tap,
 * plus "Clear all" once there are two. One scrolling row, so long tag names
 * and UI scale 1.3 never wrap it. Renders nothing at the defaults.
 */
export function FilterTokenRow({ tokens }: { tokens: FilterToken[] }) {
  if (tokens.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-2 items-center"
      className="mb-3 -mt-1"
    >
      {tokens.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => {
            lightHaptic();
            t.onRemove();
          }}
          hitSlop={4}
          className="flex-row items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-primary/15 border border-primary/40 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t.a11yLabel}
        >
          <Text className="text-blue-400 text-xs font-medium" numberOfLines={1}>
            {t.label}
          </Text>
          <Icon icon={X} size={12} color="#60a5fa" />
        </Pressable>
      ))}
      {tokens.length > 1 ? (
        <Pressable
          onPress={() => {
            lightHaptic();
            for (const t of tokens) t.onRemove();
          }}
          hitSlop={6}
          className="px-2 py-1.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Clear all filters and sort"
        >
          <Text className="text-zinc-400 text-xs font-medium">Clear all</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
