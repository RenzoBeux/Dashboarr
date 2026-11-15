import { useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { SlidersHorizontal, TextSearch, X } from "lucide-react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme-color";
import { filterSortA11yLabel } from "@/lib/library-filter-tokens";

/** The field's text part: leading icon, the input, and a clear button with text. */
function LibrarySearchInput({
  query,
  onQuery,
  placeholder,
  accessibilityLabel,
  onFocusChange,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  onFocusChange: (focused: boolean) => void;
}) {
  const tc = useThemeColor();
  return (
    <>
      <Icon icon={TextSearch} size={16} color="#71717a" />
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder={placeholder}
        placeholderTextColor={tc("#71717a")}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
        clearButtonMode="never"
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        className="flex-1 text-zinc-100 text-sm py-0"
        accessibilityLabel={accessibilityLabel}
      />
      {query.length > 0 ? (
        <Pressable
          // Clears without blurring, so the keyboard stays up for a new query.
          onPress={() => onQuery("")}
          hitSlop={8}
          className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon icon={X} size={16} color="#71717a" />
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * The always-visible library search (Movies, TV, Bazarr), with the filter and
 * sort button at its trailing edge on screens that have a filter sheet. The
 * icon is TextSearch, not a magnifier: on these screens the header's
 * magnifier adds a movie or show (#483).
 */
export function LibrarySearchField({
  query,
  onQuery,
  accessibilityLabel,
  filter,
}: {
  query: string;
  onQuery: (q: string) => void;
  /** Says what is searched ("Search your movies"); the visible text is "Search". */
  accessibilityLabel: string;
  /** Omit on a screen without a filter sheet (Bazarr): no button, no divider. */
  filter?: { onPress: () => void; activeCount: number };
}) {
  const [focused, setFocused] = useState(false);
  const active = (filter?.activeCount ?? 0) > 0;
  // The filter sheet lifts itself by the keyboard's height. Opened while the
  // keyboard is still closing, it slides in lifted and then drops back, so
  // close the keyboard first and open the sheet once it is fully down.
  const openFilter = (onPress: () => void) => {
    if (!KeyboardController.isVisible()) {
      onPress();
      return;
    }
    void KeyboardController.dismiss().then(onPress);
  };
  return (
    <View
      className={`flex-row items-center gap-2 h-11 pl-3.5 ${filter ? "pr-1" : "pr-3.5"} mb-3 rounded-full bg-surface border ${
        focused ? "border-primary/60" : "border-border"
      }`}
    >
      <LibrarySearchInput
        query={query}
        onQuery={onQuery}
        placeholder="Search"
        accessibilityLabel={accessibilityLabel}
        onFocusChange={setFocused}
      />
      {filter ? (
        <>
          <View className="w-px h-5 bg-border ml-1" />
          <Pressable
            onPress={() => openFilter(filter.onPress)}
            // The button is 2.25rem round; the slop brings the target past 44pt.
            hitSlop={6}
            className={`w-9 h-9 rounded-full items-center justify-center active:opacity-70 ${
              active ? "bg-primary/15" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel={filterSortA11yLabel(filter.activeCount)}
          >
            <Icon
              icon={SlidersHorizontal}
              size={16}
              color={active ? "#60a5fa" : "#a1a1aa"}
            />
            {active ? (
              <View className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
            ) : null}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
