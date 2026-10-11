import { useEffect, useRef } from "react";
import { View, Pressable, ScrollView, TextInput } from "react-native";
import { LayoutGrid, List, Search, X } from "lucide-react-native";
import { ServiceHeader } from "@/components/common/service-header";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme-color";
import { lightHaptic } from "@/lib/haptics";
import type { LibraryViewMode } from "@/store/library-view-store";
import type { ServiceId } from "@/lib/constants";

/**
 * The header of a library screen: the service title (with instance picker and
 * status), optional segments next to it (Library / History), and icon
 * buttons on the right — search this list, switch list/poster view, plus any
 * screen-specific actions. Search opens as its own row below the header, so
 * it never hides the segments or the view switch.
 *
 * Shared by the Bazarr tab and the Radarr/Sonarr libraries. The search row
 * sits at the top of the screen, so the keyboard can never cover it.
 */
export function LibraryToolbar<S extends string>({
  title,
  serviceId,
  online,
  segments,
  search,
  view,
  actions,
}: {
  title: string;
  serviceId?: ServiceId;
  online?: boolean;
  segments?: {
    options: readonly { value: S; label: string }[];
    value: S;
    onChange: (next: S) => void;
  };
  search?: {
    open: boolean;
    onToggle: () => void;
    query: string;
    onQuery: (q: string) => void;
    placeholder: string;
  };
  view?: { mode: LibraryViewMode; onToggle: () => void };
  // Extra icon buttons, before search and view (e.g. Add, Scan).
  actions?: React.ReactNode;
}) {
  // Focus the search field when the user opens it, not every time the list
  // remounts its header (switching view mode or tabs) with search still open.
  const openAtMount = useRef(search?.open ?? false);
  useEffect(() => {
    if (!search?.open) openAtMount.current = false;
  }, [search?.open]);

  return (
    <View>
      <View className="flex-row items-center gap-2">
        <View className="flex-shrink min-w-0">
          <ServiceHeader
            name={title}
            online={online}
            serviceId={serviceId}
            className="flex-shrink"
          />
        </View>
        {segments ? (
          // Scrolls instead of clipping when the title, instance name and
          // segments outgrow the row (long names, uiScale 1.3).
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // mb-2 lines the chips up with the title, which ServiceHeader
            // offsets with its own mt-2 mb-4.
            // min-w keeps at least one segment visible (scrollable to the
            // rest) when the title and instance name fill the row.
            className="flex-1 mb-2 min-w-[6.5rem]"
            contentContainerClassName="gap-1.5 items-center"
          >
            {segments.options.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                selected={segments.value === o.value}
                // Re-tapping the current segment is not a switch (callers
                // reset search on a switch).
                onPress={() => {
                  if (o.value !== segments.value) segments.onChange(o.value);
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <View className="flex-1" />
        )}
        <View className="flex-row items-center gap-1.5 flex-shrink-0">
          {actions}
          {search ? (
            <ToolbarIconButton
              icon={Search}
              label={search.open ? "Close search" : "Search this list"}
              active={search.open}
              onPress={() => {
                lightHaptic();
                search.onToggle();
              }}
            />
          ) : null}
          {view ? (
            <ToolbarIconButton
              icon={view.mode === "list" ? LayoutGrid : List}
              label={view.mode === "list" ? "Show posters" : "Show list"}
              onPress={() => {
                lightHaptic();
                view.onToggle();
              }}
            />
          ) : null}
        </View>
      </View>

      {search?.open ? (
        <LibrarySearchRow
          query={search.query}
          onQuery={search.onQuery}
          placeholder={search.placeholder}
          autoFocus={!openAtMount.current}
        />
      ) : null}
    </View>
  );
}

/** A square icon button for the toolbar's right-hand cluster. */
export function ToolbarIconButton({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={`w-9 h-9 rounded-xl items-center justify-center active:opacity-70 mb-2 ${
        active ? "bg-primary/15" : "bg-surface"
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
    >
      <Icon icon={icon} size={18} color={active ? "#60a5fa" : "#d4d4d8"} />
    </Pressable>
  );
}

function LibrarySearchRow({
  query,
  onQuery,
  placeholder,
  autoFocus,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  autoFocus: boolean;
}) {
  const tc = useThemeColor();
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // Focus once the row has mounted, so the keyboard opens with it.
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
    // Only on mount: the decision is made when the row appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View className="flex-row items-center gap-2 h-11 px-3 mb-3 rounded-xl bg-surface border border-primary/60">
      <Icon icon={Search} size={16} color="#71717a" />
      <TextInput
        ref={inputRef}
        value={query}
        onChangeText={onQuery}
        placeholder={placeholder}
        placeholderTextColor={tc("#71717a")}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        className="flex-1 text-zinc-100 text-sm py-0"
        accessibilityLabel={placeholder}
      />
      {query.length > 0 ? (
        <Pressable
          onPress={() => onQuery("")}
          hitSlop={8}
          className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon icon={X} size={16} color="#71717a" />
        </Pressable>
      ) : null}
    </View>
  );
}
