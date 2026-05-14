import { Pressable, Text, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

interface FilterSortButtonProps {
  // Short summary rendered inside the pill (e.g. "Monitored · Title A→Z"). The
  // caller composes this from whatever active filter/sort it has selected.
  summary: string;
  onPress: () => void;
  // True when either filter or sort is non-default — drives the highlighted
  // appearance so the user can tell at a glance that their view is filtered.
  active: boolean;
}

/**
 * Single trigger that replaces the previous chip-row + Sort button pair on
 * the Movies and TV screens. Frees the full row width for one element, which
 * is why a UI-scale-1.3 layout no longer hides chips behind a right-anchored
 * Sort button (issue #58).
 */
export function FilterSortButton({
  summary,
  onPress,
  active,
}: FilterSortButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className={`flex-row items-center gap-2 px-3 py-2 rounded-full active:opacity-70 self-start ${
        active ? "bg-primary/15 border border-primary/40" : "bg-surface-light"
      }`}
    >
      <Icon
        icon={SlidersHorizontal}
        size={14}
        color={active ? "#3b82f6" : "#a1a1aa"}
      />
      <Text
        className={`text-sm font-medium ${
          active ? "text-primary" : "text-zinc-300"
        }`}
        numberOfLines={1}
      >
        {summary}
      </Text>
      {active ? (
        <View className="w-1.5 h-1.5 rounded-full bg-primary" />
      ) : null}
    </Pressable>
  );
}
